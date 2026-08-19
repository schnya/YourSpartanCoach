# Plan: LINE 完全撤廃 → Telegram 移行

## 目標
- LINE Messaging API を完全に削除し、Telegram Bot API に一本化する。
- bot → ユーザーへの **片push（朝/進捗/夜/入浴リマインド）** と、ユーザー → bot への **記録投稿（webhook 受信・返信）** の両方を Telegram で動かす。
- 複数通/日の push は必須。料金は払わない（Telegram Bot API は無料、soft limit 約 30 msg/秒）。
- 背景: LINE Free プラン（月 200 通）の上限に達し `429 You have reached your monthly limit.` で push が弾かれていた。

## 設計の要点
- **Telegram には replyToken がない**。返信も push も `sendMessage(chatId, text)` で統一可能 → 実装は LINE より簡素になる。
- 既存 `PushClient` インターフェース（`pushMessage(userId, text, options?)`）をそのまま流用し、実装を `createTelegramClient` に置き換える。`userId` は Telegram の `chat.id`（数値文字列）として扱う。
- 双方向対話: LINE の署名検証（`validateSignature`）は Telegram の `secret_token` ヘッダー検証（`X-Telegram-Bot-Api-Secret-Token`）に置換。
- 入浴リマインドの QuickReply「入った」は Telegram の `InlineKeyboardButton`（callback_data）または `ReplyKeyboardMarkup` に変換。今回は `ReplyKeyboardMarkup`（「入った」ボタン）で十分。

## 変更ファイル一覧

### 1. src/shared/integrations/telegram/telegramClient.ts（新規）
- `TELEGRAM_BOT_TOKEN` から `fetch` で `https://api.telegram.org/bot<token>/sendMessage` を叩く薄いクライアント。
- `sendMessage(chatId, text, options?: { replyMarkup?: object })` を実装。
- `@line/bot-sdk` への依存を完全に排除（外部 SDK 不要、`fetch` のみ）。
- テスト用に in-memory mock も同ファイルまたは helper に置く。

### 2. src/features/cron-push/helper.ts
- `import { messagingApi } from "@line/bot-sdk"` → 削除。
- `createLinePushClient` を `createTelegramClient` に置換（シグネチャ互換: `pushMessage(userId, text, options?)` を `sendMessage` へ）。
- `PushClient` インターフェースは維持（cron.ts 側の変更を最小に）。
- QuickReply 構築 `buildQuickReply` を Telegram の `ReplyKeyboardMarkup` 構築に変更（オプション名は `quickReplyLabel` のまま互換）。

### 3. src/features/cron-push/cron.ts
- `createLinePushClient(process.env.LINE_CHANNEL_ACCESS_TOKEN)` → `createTelegramClient(process.env.TELEGRAM_BOT_TOKEN)`。
- `getUserId` を `process.env.TELEGRAM_USER_ID` に変更。
- `lineApi.pushMessage` 呼び出しはそのまま（インターフェース互換）。

### 4. src/features/webhook-reply/webhook.ts
- `POST /webhook`（LINE）を `POST /telegram/webhook` に変更。
- `validateSignature`（LINE）を `secret_token` ヘッダー検証に置換（env: `TELEGRAM_WEBHOOK_SECRET`）。
- ボディを LINE `WebhookEvent` から Telegram `Update` にパース: `update.message.text`, `update.message.from.id`, `update.message.chat.id`。
- `processSingleEvent` の引数型を Telegram 向けに変更。`handleUserLogMessage` / `enqueueBounceMessage` はロジックをそのまま流用（userId を `chat.id` に、replyToken を `chat.id` に差し替え）。

### 5. src/features/webhook-reply/messageHandlers.ts
- `client.replyMessage({ replyToken, messages })` → `client.sendMessage(chatId, text)` に変更。
- `handleUserLogMessage` の引数から `replyToken` を削除し、`chatId` を受け取る形に。

### 6. src/shared/integrations/google-tasks/googleTasks.ts
- `notifyTokenExpired` 内の LINE push を Telegram `sendMessage` に置換（env: `TELEGRAM_BOT_TOKEN` / `TELEGRAM_USER_ID`）。

### 7. テスト
- `cron.test.ts`, `webhook.test.ts`, `messageHandlers.test.ts`, `bounceRelay.test.ts` の `@line/bot-sdk` モックを Telegram 用 mock に置換。
- `withMockEnv()` の `LINE_*` → `TELEGRAM_*` に。

### 8. 依存・設定
- `package.json` / `deno.json` / `deno.lock` から `@line/bot-sdk` を削除。
- `.env.example` の `LINE_*` → `TELEGRAM_BOT_TOKEN`, `TELEGRAM_USER_ID`, `TELEGRAM_WEBHOOK_SECRET`。
- `lat.md/routing.md`, `lat.md/architecture.md` の「LINE」記述を「Telegram」に更新。

## ユーザー（schnya）がやること（私は実行不可）
1. Telegram で `@BotFather` に `/newbot` → bot 作成、トークン（`123456:ABC...`）を取得。
2. 作った bot に自分で何かメッセージを送る（user id 取得のため）。
3. トークンを `.env` の `TELEGRAM_BOT_TOKEN` に、user id は私が `getUpdates` で引いて `TELEGRAM_USER_ID` に設定。
4. `TELEGRAM_WEBHOOK_SECRET` を任意の長い文字列で設定。
5. Deno Deploy の env を `LINE_*` → `TELEGRAM_*` に差し替え、webhook URL を `/telegram/webhook` に変更、`setWebhook` で登録。

## 検証
- `deno check src/index.ts` 通過。
- `deno test -A --unstable-kv` 全通。
- ローカルで `deno serve` 起動 → `/cron/progress` を叩き、実際の Telegram アカウントにメッセージが届くことを確認（私が実施、トークン必要）。
- `lat check` 通過。

## リスク・注意
- Telegram webhook はポート 443/80/88/8443 のみ。Deno Deploy は対応済み。
- `getUpdates` と webhook は排他。webhook 設定中は `getUpdates` は使えない（user id 取得のみ一時利用）。
- 朝・進捗・夜の push が月 200 通の壁から解放されるが、Telegram の soft limit（約 30 msg/秒）は守るよう、連続 push には最低限の間隔を空ける。
