// Telegram Bot API クライアント（@line/bot-sdk に依存しない薄いラッパー）。
// 参照: [[routing#Telegram Integration]]

export interface TelegramSendOptions {
  // 入浴リマインド等の「入った」ボタン用。Telegram の ReplyKeyboardMarkup に変換される。
  quickReplyLabel?: string;
  // 任意の inline/reply キーボードを直接渡す場合（上級）。
  replyMarkup?: unknown;
}

export interface MessagingClient {
  sendMessage(
    chatId: string,
    text: string,
    options?: TelegramSendOptions,
  ): Promise<void>;
}

const TELEGRAM_API_BASE = "https://api.telegram.org/bot";

function buildReplyMarkup(options?: TelegramSendOptions): unknown | undefined {
  if (options?.replyMarkup) return options.replyMarkup;
  if (options?.quickReplyLabel) {
    // 1ボタンのキーボード。一度押すと通常表示に戻る（one_time_keyboard）。
    return {
      keyboard: [[{ text: options.quickReplyLabel }]],
      one_time_keyboard: true,
      resize_keyboard: true,
    };
  }
  return undefined;
}

export function createTelegramClient(botToken?: string): MessagingClient {
  if (!botToken || botToken === "your_telegram_bot_token_here") {
    // モック（テスト・未設定時）: コンソールに出力のみ。
    return {
      async sendMessage(chatId: string, text: string) {
        console.warn(
          "[Telegram Mock]: token missing or default. Outputting to console:",
        );
        console.log(`>>> TG[${chatId}]: ${text}`);
      },
    };
  }

  return {
    async sendMessage(chatId: string, text: string, options?: TelegramSendOptions) {
      const replyMarkup = buildReplyMarkup(options);
      const body: Record<string, unknown> = {
        chat_id: chatId,
        text,
        // Markdown は LINE と同じく平文扱いにするため無効（parse_mode 未指定）。
      };
      if (replyMarkup) body.reply_markup = replyMarkup;

      try {
        const res = await fetch(
          `${TELEGRAM_API_BASE}${botToken}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        if (!res.ok) {
          const detail = await res.text();
          throw new Error(`Telegram sendMessage HTTP ${res.status}: ${detail}`);
        }
        console.log(`[Telegram Send Success]: Sent to chat=${chatId}`);
      } catch (err: unknown) {
        const errorDetail = err instanceof Error ? err.message : String(err);
        console.error(
          `[Telegram Send Error for chat=${chatId}]:`,
          errorDetail,
        );
        throw err;
      }
    },
  };
}

// テスト用 in-memory クライアント。
export function _createInMemoryMessagingClient(
  sentLog: { chatId: string; text: string }[],
): MessagingClient {
  return {
    async sendMessage(chatId: string, text: string) {
      sentLog.push({ chatId, text });
    },
  };
}
