import type { MessagingClient } from "../../shared/integrations/telegram/telegramClient.js";
import {
  appendRawUserLog,
  getToday,
  recordSentMessage,
} from "../../shared/memory/dailyLogStore.js";
import { getUserState, setUserState } from "../../shared/memory/fsmStore.js";
import { getBathDay } from "../cron-push/helper.js";

async function replyText(
  client: MessagingClient,
  chatId: string,
  text: string,
) {
  // Telegram には replyToken がない。返信も sendMessage(chatId, ...) で統一。
  return await client.sendMessage(chatId, text);
}

// ユーザーからの任意の投稿（テキスト・画像）を「記録」として扱い、
// 「記録したよ 👍」を自動返信する。AI 審査・状態遷移の承認は行わない。
// 返信フラグを立て、IDLE（未確認）状態なら ACTIVE に復帰させる。
export async function handleUserLogMessage(
  userId: string,
  chatId: string,
  rawText: string,
  client: MessagingClient,
  isImage = false,
) {
  const today = getToday();
  const logText = isImage ? "[画像を記録]" : rawText;
  await appendRawUserLog(userId, today, logText);

  // 返信フラグ + タイムスタンプ更新、IDLE→ACTIVE 復帰
  const stateData = await getUserState(userId);
  const wasIdle = stateData.state === "IDLE";
  await setUserState(userId, "ACTIVE", {
    ...stateData.metadata,
    repliedToday: true,
    lastUserReplyAt: new Date().toISOString(),
    ...(rawText.trim() === "入った" && {
      bathCompletedAt: getBathDay(),
    }),
  });

  const reply = "記録したよ 👍";
  await recordSentMessage(userId, today, "Reply", reply);
  await replyText(client, chatId, reply);

  void wasIdle;
  return;
}
