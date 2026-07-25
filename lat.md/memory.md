# Memory Store

LINE Bot におけるセッション状態や会話履歴、タスク情報を永続化・管理するストレージ抽象化レイヤーについて説明します。

サーバーレスの制約下でもステートフルな体験を実現するため、[[src/services/memoryStore.ts]] にストレージ制御ロジックを集約しています。

## Upstash Redis Store

本番環境（Vercel）において、コールドスタートやコネクション上限を回避し、高速かつ安定した読み書きを実現するためのサーバーレス向け Redis 構成です。

`process.env.UPSTASH_REDIS_REST_URL` などの環境変数をもとに、[[src/services/memoryStore.ts#getRedisClient]] を経由して Upstash Redis クライアントが動的に初期化されます。キーは `user:${userId}:state` や `user:${userId}:score` のように LINE の `userId` ごとに完全に分離されたマルチテナント構造を採用し、重複排除用のイベントキー `event:${eventId}:processed` は [[src/services/memoryStore.ts#checkAndMarkEventProcessed]] で制御されます。

## Local Markdown Store

ローカル開発環境での動作確認や、ユーザープロファイルなどの静的設定、バックアップ用ストレージとしてのファイルシステム利用について説明します。

[[src/services/memoryStore.ts#readUserProfile]] や [[src/services/memoryStore.ts#readPatterns]] などの関数によって、`memory/users/${userId}/` 配下の Markdown ファイルから個別設定を読み取ります。また、Redis 不在のテスト・開発用フォールバックとして、インメモリのマップキャッシュによる状態追従を実現しています。

## Daily Action Logs

日々のタスクや HP の状態変化、Bot が送信した朝夕のメッセージ内容などを日付単位のログとして管理する仕組みです。

[[src/services/memoryStore.ts#readDailyLog]] や [[src/services/memoryStore.ts#saveDailyLog]] によって Redis やローカル Markdown のログを相互に同期し、[[src/services/memoryStore.ts#carryOverPendingTasks]] が前日の未完了タスクをキャリーオーバーします。さらに、[[src/services/memoryStore.ts#getUserState]] や [[src/services/memoryStore.ts#setUserState]] による FSM 状態の更新や、[[src/services/memoryStore.ts#getDisciplineScore]] および [[src/services/memoryStore.ts#updateDisciplineScore]] による 0〜100 の範囲でクランプされた規律スコアの変化もデイリーログの Status セクションに自動的に反映・追記されます。
