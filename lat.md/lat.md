# ARES Knowledge Graph

スパルタ型AIライフコーチ ARES (Automated Rigorous Execution System) のシステム構成、メモリ設計、および各サービス・ルーティング定義を管理するナレッジグラフです。

本プロジェクトの設計理念と各機能の詳細を、以下のセクションに整理しています。

- [[architecture|システムアーキテクチャ]]: Hono 基盤のコンポーネント構造とエントリーポイント（Webhook/Cron/Storage/LINE Gateway）。
- [[memory|メモリ設計]]: Upstash Redis とローカル Markdown を併用した FSM 状態・会話ログ・習慣化指標の永続化。
- [[routing|ルーティング定義]]: Hono による LINE Webhook 受信（署名検証・重複排除）および Vercel Cron（朝夕プッシュ・ペナルティ判定）。
- [[llm|LLM 連携]]: Gemini API クライアント（マルチモーダル判定）と状態適応型プロンプト（Task Routing・4ステップ習慣化ループ注入）。
- [[habit-formation|習慣化特化設計]]: 挑戦数の最大化に向けた対話フロー（Listen-Affirm-Question-Step）・KPI（North Star）・安全境界（非医療）。

## 依存関係・セクション参照

セクション間の主な依存関係・参照関係は以下の通りです。

- [[habit-formation|習慣化特化設計]] $\to$ [[llm|LLM 連携]] (`spartanPrompts.ts`), [[architecture|システムアーキテクチャ]] (`contextBuilder.ts`, `messageHandlers.ts`), [[memory|メモリ設計]] (`habitMetrics.ts`, `dailyLogStore.ts`)
- [[routing|ルーティング定義]] $\to$ [[architecture|システムアーキテクチャ]] (`webhook.ts`, `cron.ts`), [[llm|LLM 連携]] (`contextBuilder.ts`)
- [[llm|LLM 連携]] $\to$ [[memory|メモリ設計]] (プロンプト生成時の過去コンテキスト・FSM状態参照)
- [[architecture|システムアーキテクチャ]] $\to$ [[memory|メモリ設計]] (`fsmStore.ts`, `dailyLogStore.ts`)
