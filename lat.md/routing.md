# Routing System

LINE Messaging API からの Webhook 受信、スケジュールプッシュ用 Cron、およびローカル内省・目標アライメント追跡サービス (bounce-ideas-off) 向けの中継エンドポイント構成について説明します。

Hono を用いて、[[src/features/webhook-reply/webhook.ts]] の `/webhook` エンドポイント、[[src/features/cron-push/cron.ts]] の `/cron` エンドポイント、および [[src/features/bounce-relay/bounceRelay.ts]] の `/api` エンドポイントを統合しています。

## Webhook Endpoint

LINE Bot の主要な対話インターフェースとして、ユーザーメッセージの受信・解析、署名検証、重複排除、リプライ返信および内省コマンドの中継キュー格納を担うエンドポイントです。

[[src/features/webhook-reply/webhook.ts]] において、`validateSignature` を使用して `x-line-signature` の正当性を検証します。その後、LINE からのリトライによる多重処理を防ぐために `checkAndMarkEventProcessed` による重複排除を行います。テキストメッセージが内省コマンド（`/dev`, `/idea`, `/log`, `/notice`）で始まる場合は `BOUNCE_CMD_RE` にて検知し、Deno KV キューに保存して即座に 200 OK を返します。その他の通常対話は FSM 状態に応じた対話処理を制御して `MessagingApiClient` より応答します。

## Bounce Relay Endpoint

ローカルで動作する内省トラッカー (bounce-ideas-off) が LINE メッセージを受信・処理するための安全なデータ取得エンドポイントです。

[[src/features/bounce-relay/bounceRelay.ts]] で定義される `POST /api/pull-bounce` エンドポイントは、`BOUNCE_SECRET` による認証を行い、Deno KV 内の `bounce_pending` キューに蓄積されたメッセージ（`id`, `userId`, `text`, `receivedAt`）をアトミックに取得・消去して返却します。

## Cron Trigger Routing

朝の定期プラン宣言の要求や、タスクの開始・報告遅延を検知して自動でペナルティを判定するスケジューラエンドポイントです。

[[src/features/cron-push/cron.ts]] で定義されるエンドポイントは、`CRON_SECRET` に基づく認証を行い、朝（`/morning`）は Google Tasks から当日タスクを取得し、AIが優先度付けと行動経済学的な意見を添えたメッセージをプッシュして ACTIVE ループを開始します。60分おきの `/progress` では、直近60分でユーザー返信またはタスク増減があったかを判定し、両方なければ IDLE（LINE未確認）へ移行してpushを停止します。ただし、既知の最終返信から4時間以上経過した場合は、`lastNudgeAt` で連発を抑えた優しいnudgeを1回送信します。夜間の `/cron/evening` では、日中のタスク増減とLINE返信の有無で加点（両方あり: +5）／減点（両方なし: -5）を判定し、総括メッセージを送信します。

`/bath` は外部スケジューラ（GitHub Actions）から20分おきに呼び出され（GitHub Actions 側で JST 19:00〜翌02:59 の送信時間帯を制御）、LLMを使わない固定の入浴リマインドを送信します。「入った」クイックリプライで当日の入浴完了を記録し、翌03:00まで再送を止めます。文面は就寝1〜2時間前の40〜42.5℃の温浴を支持する系統的レビュー（Haghayegh et al., 2019, PMID 31102877）に基づきます。

## Public Landing Page

サービス概要とプライバシーポリシーを表示する静的ページエンドポイントです。

[[src/index.ts]] において、ルートパス（`/`）および `/privacy` パスで HTML ページをレスポンスします。
