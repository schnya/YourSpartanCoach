import type { Context } from "hono";
import { Hono } from "hono";
import { enqueueBounceMessage } from "../bounce-relay/bounceRelay.js";
import { checkAndMarkEventProcessed } from "../../shared/memory/dailyLogStore.js";
import {
  createTelegramClient,
  type MessagingClient,
} from "../../shared/integrations/telegram/telegramClient.js";
import { handleUserLogMessage } from "./messageHandlers.js";

// @lat: [[routing#Telegram Webhook Endpoint]]
const webhookApp = new Hono();
export const BOUNCE_CMD_RE = /^(\/dev|\/idea|\/log|\/notice)(\s|$)/i;

function getTelegramConfig(c: Context) {
  const env = (c.env as Record<string, string>) || {};
  const botToken = (
    process.env.TELEGRAM_BOT_TOKEN ||
    env.TELEGRAM_BOT_TOKEN ||
    ""
  ).trim();
  const webhookSecret = (
    process.env.TELEGRAM_WEBHOOK_SECRET ||
    env.TELEGRAM_WEBHOOK_SECRET ||
    ""
  ).trim();
  return { botToken, webhookSecret };
}

function createTelegramClients(botToken: string): {
  client: MessagingClient;
} {
  // 送信は MessagingClient 経由（cron と同じ）。webhook では reply も sendMessage で行う。
  return { client: createTelegramClient(botToken) };
}

// Telegram Update の最小型（必要な部分のみ）。
interface TelegramMessage {
  message_id: number;
  from?: { id: number; is_bot: boolean; username?: string };
  chat: { id: number; type: string };
  text?: string;
  date: number;
}
interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export async function processSingleEvent(
  update: TelegramUpdate,
  client: MessagingClient,
  botToken: string,
) {
  const message = update.message;
  if (!message || !message.from) {
    return;
  }

  const eventId = `${update.update_id}-${message.message_id}`;
  const isDuplicate = await checkAndMarkEventProcessed(eventId);
  if (isDuplicate) {
    console.warn(
      `[Webhook Warning]: Duplicate event detected and ignored: ${eventId}`,
    );
    return;
  }

  const userId = String(message.from.id);
  const chatId = String(message.chat.id);

  if (message.text && BOUNCE_CMD_RE.test(message.text.trim())) {
    const receivedAt = new Date(message.date * 1000).toISOString();
    const id = crypto.randomUUID();
    await enqueueBounceMessage({
      id,
      userId,
      text: message.text.trim(),
      receivedAt,
    });
    return;
  }

  // その他のテキスト・画像（ここではテキストのみ扱う）投稿は「記録」として扱う。
  if (message.text) {
    await handleUserLogMessage(
      userId,
      chatId,
      message.text.trim(),
      client,
      false,
    );
  }
  // 画像等は現状ログのみ（recordSentMessage 相当の拡張は別タスク）。
}

webhookApp.post("/", async (c) => {
  try {
    const { botToken, webhookSecret } = getTelegramConfig(c);
    console.log(
      `[Webhook Env Check]: Token Length = ${botToken.length}, Secret Length = ${webhookSecret.length}`,
    );

    const secretHeader = c.req.header("x-telegram-bot-api-secret-token");

    if (webhookSecret) {
      if (secretHeader !== webhookSecret) {
        console.error("[Webhook Error]: Invalid Telegram secret token");
        return c.text("Invalid secret token", 401);
      }
    } else {
      console.warn(
        "[Webhook Warning]: TELEGRAM_WEBHOOK_SECRET is not set; skipping secret-token verification.",
      );
    }

    let body: TelegramUpdate;
    try {
      body = await c.req.json();
    } catch (err) {
      console.error("[Webhook Error]: Failed to parse JSON body", err);
      return c.text("Bad Request", 400);
    }

    if (!body || typeof body !== "object" || !("update_id" in body)) {
      console.warn("[Webhook Warning]: Payload is not a Telegram Update");
      return c.text("Bad Request", 400);
    }

    const { client } = createTelegramClients(botToken);
    await processSingleEvent(body, client, botToken);

    return c.text("OK", 200);
  } catch (globalErr: unknown) {
    const errDetail =
      globalErr instanceof Error ? globalErr.message : String(globalErr);
    console.error("[Webhook Critical Error]:", errDetail);
    return c.text("Internal Server Error", 500);
  }
});

export default webhookApp;
