# Shared Infrastructure & Integrations (`src/shared/`)

本ディレクトリは、複数の Feature（垂直スライス）から共有利用される基盤コンポーネントおよび外部連携モジュールを集約します。

## ディレクトリ構成指針

```
src/shared/
├── memory/            # 内部永続化基盤（Upstash Redis + ローカル Markdown 二層ストレージ）
├── llm.ts             # Gemini API LLM推論クライアント
├── integrations/      # 外部サードパーティ API 連携モジュール
│   └── google-tasks/  # Google Tasks REST API 連携
└── README.md
```

### 役割の分離基準

- **コア基盤モジュール (`shared/llm.ts`, `shared/memory/`)**:
  - アプリケーション全体で一貫して使われるデータ永続化・モデル推論などの共通コア。
- **外部連携モジュール (`shared/integrations/`)**:
  - Google Tasks や 将来の外部 API（カレンダー、その他リマインダーサービス等）との連携。
  - 各連携先ごとに独立したフォルダ（例: `integrations/google-tasks/`）として切り出し、Feature 間の水平依存（`features/A` が `features/B` に依存すること）を回避します。
