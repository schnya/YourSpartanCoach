# Routing System

Telegram Bot API からの Webhook 受信、スケジュールプッシュ用 Cron、およびローカル内省・目標アライメント追跡サービス (bounce-ideas-off) 向けの中継エンドポイント構成について説明します。

Hono を用いて、[[src/features/webhook-reply/webhook.ts]] の `/telegram/webhook` エンドポイント、[[src/features/cron-push/cron.ts]] の `/cron` エンドポイント、および [[src/features/bounce-relay/bounceRelay.ts]] の `/api` エンドポイントを統合しています。

## Telegram Webhook Endpoint

Telegram Bot の主要な対話インターフェースとして、ユーザーメッセージの受信・解析、secret-token 検証、重複排除、リプライ返信および内省コマンドの中継キュー格納を担うエンドポイントです。

[[src/features/webhook-reply/webhook.ts]] において、Telegram からの `X-Telegram-Bot-Api-Secret-Token` ヘッダーを `TELEGRAM_WEBHOOK_SECRET` と照合して検証します（`secret_token` は `setWebhook` 時に登録）。その後、Telegram からの重複配信を防ぐために `checkAndMarkEventProcessed` による重複排除を行います。受信ボディは Telegram `Update` オブジェクトで、`message.text` / `message.from.id` / `message.chat.id` を取り出します。テキストメッセージが内省コマンド（`/dev`, `/idea`, `/log`, `/notice`）で始まる場合は `BOUNCE_CMD_RE` にて検知し、Deno KV キューに保存して即座に 200 OK を返します。その他の通常対話は [[src/features/webhook-reply/messageHandlers.ts#handleUserLogMessage]] にて「記録」として扱い、`MessagingClient.sendMessage` より「記録したよ 👍」を返信します。Telegram には replyToken が存在しないため、返信も push も `sendMessage(chatId, text)` で統一されています。

## Bounce Relay Endpoint

ローカルで動作する内省トラッカー (bounce-ideas-off) が Telegram メッセージを受信・処理するための安全なデータ取得エンドポイントです。

[[src/features/bounce-relay/bounceRelay.ts]] で定義される `POST /api/pull-bounce` エンドポイントは、`BOUNCE_SECRET` による認証を行い、Deno KV 内の `bounce_pending` キューに蓄積されたメッセージ（`id`, `userId`, `text`, `receivedAt`）をアトミックに取得・消去して返却します。

## Cron Trigger Routing

朝の定期プラン宣言の要求や、タスクの開始・報告遅延を検知して自動でペナルティを判定するスケジューラエンドポイントです。

[[src/features/cron-push/cron.ts]] で定義されるエンドポイントは、`CRON_SECRET` に基づく認証を行い、朝（`/morning`）は Google Tasks から当日タスクを取得し、AIが優先度付けと行動経済学的な意見を添えたメッセージをプッシュして ACTIVE ループを開始します。60分おきの `/progress` では、直近60分でユーザー返信またはタスク増減があったかを判定し、両方なければ IDLE（未確認）へ移行してpushを停止します。ただし、最終接触（最終返信**または**最後の progress push、例: 朝の `/morning`）から4時間以上経過した場合は、`lastNudgeAt` で連発を抑えた優しいnudgeを1回送信します。これは「一度も返信していないユーザー」にも適用されるため、未確認状態が固定化されて通知が永久に止まることを防ぎます。夜間の `/cron/evening` では、日中のタスク増減と返信の有無で加点（両方あり: +5）／減点（両方なし: -5）を判定し、総括メッセージを送信します。

FSM 状態（ACTIVE/IDLE）と各種タイムスタンプは `[[src/shared/memory/fsmStore.ts]]` が管理し、本番では **Upstash Redis（`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`）に永続化**されます。Deno Deploy のようなサーバーレス環境ではリクエストごとに isolate が別なるため、Redis が未設定（または placeholder のまま）だと FSM 状態が次の cron 呼び出しに引き継がれず、毎回 `IDLE` で初期化されて `/progress` が「Inactive (unchecked)」を返して push を永久にスキップします。`getRedisClient()` は Redis 未設定時に一度だけ警告を出力するので、本番でこのメッセージが出たら env の設定漏れが確定です。

`/bath` は外部スケジューラ（GitHub Actions）から20分おきに呼び出され（GitHub Actions 側で JST 19:00〜翌02:59 の送信時間帯を制御）、LLMを使わない固定の入浴リマインドを送信します。「入った」クイックリプライで当日の入浴完了を記録し、翌03:00まで再送を止めます。文面は就寝1〜2時間前の40〜42.5℃の温浴を支持する系統的レビュー（Haghayegh et al., 2019, PMID 31102877）に基づきます。

## Public Landing Page

サービス概要とプライバシーポリシーを表示する静的ページエンドポイントです。

[[src/index.ts]] において、ルートパス（`/`）および `/privacy` パスで HTML ページをレスポンスします。
