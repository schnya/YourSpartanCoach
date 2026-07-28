# Memory Store

LINE Bot におけるセッション状態や会話履歴、タスク情報を永続化・管理するストレージ抽象化レイヤーについて説明します。

サーバーレスの制約下でもステートフルな体験を実現するため、`src/shared/memory/` 配下にストレージ制御ロジックを集約・モジュール化しています。デイリーログのエントリポイントは [[src/shared/memory/dailyLogStore.ts#readDailyLog]] です。

## Upstash Redis Store

本番環境（Deno Deploy）において、コールドスタートやコネクション上限を回避し、高速かつ安定した読み書きを実現するためのサーバーレス向け Redis 構成です。

`process.env.UPSTASH_REDIS_REST_URL` などの環境変数をもとに、[[src/shared/memory/redisClient.ts#getRedisClient]] を経由して Upstash Redis クライアントが動的に初期化されます。キーは `user:${userId}:state` や `user:${userId}:score` のように LINE の `userId` ごとに完全に分離されたマルチテナント構造を採用し、重複排除用のイベントキー `event:${eventId}:processed` は [[src/shared/memory/dailyLogStore.ts#checkAndMarkEventProcessed]] で制御されます。

## Local Markdown Store

ローカル開発環境での動作確認や、ユーザープロファイルなどの静的設定、バックアップ用ストレージとしてのファイルシステム利用について説明します。

[[src/shared/memory/profileStore.ts#readUserProfile]] や [[src/shared/memory/profileStore.ts#readPatterns]] などの関数によって、`memory/users/${userId}/` 配下の Markdown ファイルから個別設定を読み取ります。また、Redis 不在のテスト・開発用フォールバックとして、インメモリのマップキャッシュによる状態追従を実現しています。

## Daily Action Logs

日々のタスクや HP の状態変化、Bot が送信した朝夕のメッセージ内容などを日付単位のログとして管理する仕組みです。

[[src/shared/memory/dailyLogStore.ts#readDailyLog]] や [[src/shared/memory/dailyLogStore.ts#saveDailyLog]] によって Redis やローカル Markdown のログを相互に同期し、[[src/shared/memory/dailyLogStore.ts#carryOverPendingTasks]] が前日の未完了タスクをキャリーオーバーします。さらに、[[src/shared/memory/fsmStore.ts#getUserState]] や [[src/shared/memory/fsmStore.ts#setUserState]] による FSM 状態の更新や、[[src/shared/memory/fsmStore.ts#getDisciplineScore]] および [[src/shared/memory/fsmStore.ts#updateDisciplineScore]] による 0〜100 の範囲でクランプされた規律スコアの変化もデイリーログの Status セクションに自動的に反映・追記されます。

### Local Log Sync & Pruning

Deno Deploy はステートレスなため、全ログは Upstash Redis に永続保存され、ローカルの `memory/users/<userId>/logs/*.md` は分析・開発用のキャッシュです。`scripts/pullLogs.mjs` が Redis から全ログを一括同期し、`scripts/pruneLogs.mjs` が保持期間（既定 30 日）超のログを削除します。ローカルログは `.gitignore` で除外し、実ログのコミット漏洩を防ぎます。

## Google Tasks Integration

ユーザーの外部タスク管理ツール（Google Tasks）と ARES FSM 状態を非同期・非ブロッキングで連携する構造について説明します。

[[src/shared/integrations/google-tasks/googleTasks.ts]] において `listGoogleTasks` で未完了タスクを取得し、朝の Cron（`/morning`）発動時に AIが優先度付けと行動経済学的意見を添えて LINE 提示します。ユーザーの承認フェーズはなく、タスクの書き換えはユーザー自身が Google Tasks 側で行います。60分おきの `/progress` では `listGoogleTaskIds` で現在のタスクID群を取得し、朝のスナップショット（`taskSnapshot`）との差分（新規追加＋完了）を検知して増減フラグを立てます。

### User Log Recording & Task Sync

ユーザーからのテキスト・画像による報告メッセージ受信時（[[src/features/webhook-reply/messageHandlers.ts#handleUserLogMessage]]）に日次ログへの書き込みと状態更新を行い、返信フラグの反映および未確認（IDLE）状態からのACTIVE復帰を処理します。

### OAuth Setup & Token Provisioning

Google Tasks 連携の認証設定手順です。`scripts/genGoogleToken.mjs` を実行しローカル HTTP サーバー経由で `GOOGLE_REFRESH_TOKEN` を `.env` へ書き込みます。同スクリプトは依存ゼロです。

## Notes Vault Hygiene

Smart Connections / RAG の検索精度を高めるため、`memory/notes/**` と `memory/users/**/*.md` に対して毎晩フロントマターと `## Related` リンクを補完する idempotent な保守スクリプトです。

Hermes cron ジョブ `vault-tidy-notes`（毎日 23:30 JST）が `scripts/tidyNotes.sh` → `scripts/tidyNotes.mjs` を実行します。スクリプトは (1) 欠落している YAML frontmatter（`type`/`status`/`tags`、ログには `user`+`date`）を補い、(2) 末尾に `## Related` の wiki-link シード（Obsidian運用方針 等の vault ノート）を1回だけ付与します。本文は書き換えず、2回目以降の実行は変更ゼロ（冪等）です。

### Daily Log 互換性

ARES デイリーログ（`memory/users/<userId>/logs/*.md`）へ frontmatter を挿入しても、[[src/shared/memory/dailyLogStore.ts]] の末尾追記と `## Scheduled Tasks` 正規表現解析は影響を受けません。ボットは行1が見出しであることを前提とせず、frontmatter は単一行スカラー（ブロックリテラル不使用）で `## ` を含まないため、解析を破壊しません。
