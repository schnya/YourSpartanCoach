# Memory Store

LINE Bot におけるセッション状態や会話履歴、タスク情報を永続化・管理するストレージ抽象化レイヤーについて説明します。

サーバーレスの制約下でもステートフルな体験を実現するため、[[src/services/memoryStore.ts]] をエントリポイントとして `src/services/memory/` 配下にストレージ制御ロジックを集約・モジュール化しています。

## Upstash Redis Store

本番環境（Deno Deploy）において、コールドスタートやコネクション上限を回避し、高速かつ安定した読み書きを実現するためのサーバーレス向け Redis 構成です。

`process.env.UPSTASH_REDIS_REST_URL` などの環境変数をもとに、[[src/services/memory/redisClient.ts#getRedisClient]] を経由して Upstash Redis クライアントが動的に初期化されます。キーは `user:${userId}:state` や `user:${userId}:score` のように LINE の `userId` ごとに完全に分離されたマルチテナント構造を採用し、重複排除用のイベントキー `event:${eventId}:processed` は [[src/services/memory/dailyLogStore.ts#checkAndMarkEventProcessed]] で制御されます。

## Local Markdown Store

ローカル開発環境での動作確認や、ユーザープロファイルなどの静的設定、バックアップ用ストレージとしてのファイルシステム利用について説明します。

[[src/services/memory/profileStore.ts#readUserProfile]] や [[src/services/memory/profileStore.ts#readPatterns]] などの関数によって、`memory/users/${userId}/` 配下の Markdown ファイルから個別設定を読み取ります。また、Redis 不在のテスト・開発用フォールバックとして、インメモリのマップキャッシュによる状態追従を実現しています。

## Daily Action Logs

日々のタスクや HP の状態変化、Bot が送信した朝夕のメッセージ内容などを日付単位のログとして管理する仕組みです。

[[src/services/memory/dailyLogStore.ts#readDailyLog]] や [[src/services/memory/dailyLogStore.ts#saveDailyLog]] によって Redis やローカル Markdown のログを相互に同期し、[[src/services/memory/dailyLogStore.ts#carryOverPendingTasks]] が前日の未完了タスクをキャリーオーバーします。さらに、[[src/services/memory/fsmStore.ts#getUserState]] や [[src/services/memory/fsmStore.ts#setUserState]] による FSM 状態の更新や、[[src/services/memory/fsmStore.ts#getDisciplineScore]] および [[src/services/memory/fsmStore.ts#updateDisciplineScore]] による 0〜100 の範囲でクランプされた規律スコアの変化もデイリーログの Status セクションに自動的に反映・追記されます。

## Google Tasks Integration

ユーザーの外部タスク管理ツール（Google Tasks）と ARES FSM 状態を非同期・非ブロッキングで連携する構造について説明します。

[[src/services/googleTasks.ts]] において `listGoogleTasks` で未完了タスクを取得し、朝の Cron 発動時に LINE 提示します。承認時は `findMatchingGoogleTask` で既存タスク ID を照合・バインドし二重作成を防ぎます。`completeGoogleTask` で合格したタスクを完了更新します。

### Plan Approval Sync

朝の計画承認時に既存 Google Task と一致した場合はその `googleTaskId` を FSM metadata にバインドし、新規タスクの場合のみ `createGoogleTask` を fire-and-forget 実行します。データは [[src/services/memory/fsmStore.ts#FsmStateData]] に保存され、後続の完了同期で再利用されます。

### Proof Approval Completion

画像またはテキストによる成果証拠が LLM 審査で PASS と判定されたタイミング（[[src/handlers/messageHandlers.ts#handleImageMessage]] および [[src/handlers/messageHandlers.ts#handleTextProofMessage]] の PASS 分岐）で、保存済み `googleTaskId` を用いて `completeGoogleTask` を fire-and-forget で呼び出し、Google Tasks 上のタスクを完了状態へ更新します。`googleTaskId` が未設定の場合は呼び出しをスキップします。

### OAuth Setup & Token Provisioning

Google Tasks 連携の認証設定手順です。`scripts/genGoogleToken.mjs` を実行しローカル HTTP サーバー経由で `GOOGLE_REFRESH_TOKEN` を `.env` へ書き込みます。同スクリプトは依存ゼロです。
