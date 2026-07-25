# Shunya as AI Knowledge Graph

LINE 伴走 Bot (line-companion-bot) のシステム構成、メモリ設計、および各サービス・ルーティング定義を管理するナレッジグラフです。

本プロジェクトの設計理念と各機能の詳細を、以下のセクションに整理しています。

- [[architecture|システムアーキテクチャ]]: システム全体のコンポーネント構造と構成要素。
- [[memory|メモリ設計]]: Upstash Redis とローカル Markdown を併用した永続化設計。
- [[routing|ルーティング定義]]: Hono を利用した LINE Webhook および Cron のエンドポイント制御。
- [[llm|LLM 連携]]: HP（エネルギー状態）に適応したプロンプティングと Gemini SDK クライアント。
