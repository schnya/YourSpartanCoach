# Routing System

LINE Messaging API からの Webhook 受信と、Vercel Cron からのスケジュールプッシュ送信用 HTTP エンドポイントの構成について説明します。

Hono を用いて、[[src/routes/webhook.ts]] の `/webhook` エンドポイントと [[src/routes/cron.ts]] の `/cron` エンドポイントを統合しています。

## Webhook Endpoint

LINE Bot の主要な対話インターフェースとして、ユーザーメッセージの受信・解析、署名検証、重複排除、リプライ返信を担うエンドポイントです。

[[src/routes/webhook.ts]] において、`validateSignature` を使用して `x-line-signature` の正当性を検証します。その後、LINE からのリトライによる多重処理を防ぐために `checkAndMarkEventProcessed` による重複排除を行い、FSM 状態（PENDING での朝の予定審査、REPORTING でのマルチモーダル成果物審査など）に応じた対話処理と状態遷移を制御して `MessagingApiClient` より応答します。

## Cron Trigger Routing

朝の定期プラン宣言の要求や、タスクの開始・報告遅延を検知して自動でペナルティを判定するスケジューラエンドポイントです。

[[src/routes/cron.ts]] で定義されるエンドポイントは、`CRON_SECRET` に基づく認証を行い、朝（`/morning`）はユーザー状態を `PENDING` にして宣言を要求し、監視チェック（`/monitor`）では `SCHEDULED` タスクの開始予定時刻超過（T+5分）や `REPORTING` タスクの証拠提出期限超過を検証します。逸脱が確認された場合、状態を `ESCAPED` へと遷移させ、規律スコアを減点した上で警告メッセージをプッシュ送信します。
