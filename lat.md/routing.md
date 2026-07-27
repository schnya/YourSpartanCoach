# Routing System

LINE Messaging API からの Webhook 受信と、Vercel Cron からのスケジュールプッシュ送信用 HTTP エンドポイントの構成について説明します。

Hono を用いて、[[src/features/webhook-reply/webhook.ts]] の `/webhook` エンドポイントと [[src/features/cron-push/cron.ts]] の `/cron` エンドポイントを統合しています。

## Webhook Endpoint

LINE Bot の主要な対話インターフェースとして、ユーザーメッセージの受信・解析、署名検証、重複排除、リプライ返信を担うエンドポイントです。

[[src/features/webhook-reply/webhook.ts]] において、`validateSignature` を使用して `x-line-signature` の正当性を検証します。その後、LINE からのリトライによる多重処理を防ぐために `checkAndMarkEventProcessed` による重複排除を行い、FSM 状態（PENDING での朝の予定審査、REPORTING でのマルチモーダル成果物審査など）に応じた対話処理と状態遷移を制御して `MessagingApiClient` より応答します。

## Cron Trigger Routing

朝の定期プラン宣言の要求や、タスクの開始・報告遅延を検知して自動でペナルティを判定するスケジューラエンドポイントです。

[[src/features/cron-push/cron.ts]] で定義されるエンドポイントは、`CRON_SECRET` に基づく認証を行い、朝（`/morning`）は Google Tasks から当日タスクを取得し、AIが優先度付けと行動経済学的な意見を添えたメッセージをプッシュして ACTIVE ループを開始します。50分おきの `/progress` では、直近50分でユーザー返信またはタスク増減があったかを判定し、両方なければ IDLE（LINE未確認）へ移行してpushを停止します。夜間の `/cron/evening` では、日中のタスク増減とLINE返信の有無で加点（両方あり: +5）／減点（両方なし: -5）を判定し、総括メッセージを送信します。
