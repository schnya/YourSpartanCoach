# LLM-Powered State-Adaptive Companion Bot (Telegram Bot)

Telegram Bot API と Google Gemini API を統合し、ユーザーのエネルギー状態（HP）やパーソナリティに適応して伴走する、ステートフルな Telegram 伴走システムです。

単なる「タスク管理」ではなく、「ユーザーのコンテキストに寄り添う生活の支援」を目的とし、Markdown ベースのナレッジモデルとサーバーレス構成を組み合わせて実装されています。

---

## 🎯 プロジェクトの狙いとアピールポイント

技術的なアピールポイントとして、以下の設計・実装に注力しています。

1. **State-Adaptive（状態適応型）プロンプティング**
   - ユーザーの会話や自己申告から「HP（1〜5）」を自動抽出して状態を管理。
   - HP低下時には自動的にトーンを和らげ、タスクの合格ラインを引き下げるなど、LLM の出力振る舞いを動的に調整するコンテキスト構築ロジックを実装。
2. **サーバーレス（Deno Deploy）におけるステートフル制御**
   - Ephemeral な Deno Deploy のエッジランタイム（サーバーレス）環境の制約を克服するため、**Upstash Redis** を用いたキャッシュ・セッションストレージ設計を採用。
   - ローカル開発時はファイルシステム（Markdown 履歴）を使い、本番環境では Redis を優先する透過的なストレージ抽象化レイヤーを構築しています。
3. **MarkdownベースのローカルRAG / Context Builder**
   - `USER_PROFILE.md` や `patterns.md` に定義されたユーザー情報・行動ルールを解析し、直近3日間の行動ログとマージして Gemini に与える文脈を最適化する Context Builder サービスを設計。
4. **GitHub Actions Cron によるリアクティブ＆プロアクティブなプッシュ配信**
   - Webhook による応答（受動的）だけでなく、定時・定期の行動チェックや振り返り（能動的）を GitHub Actions のスケジュールトリガーを用いてスケジューリング。

---

## 📐 システムアーキテクチャ

```mermaid
flowchart TD
  subgraph User_Touchpoint ["ユーザー接点"]
    User["ユーザー (Telegram client)"]
  end

  subgraph Messaging_Gateway ["メッセージングゲートウェイ"]
    LineAPI["Telegram Bot API"]
  end

  subgraph App_Backend ["アプリケーションバックエンド (Deno Deploy / Hono)"]
    WebhookHandler["Webhook / API Endpoints"]
    ContextBuilder["Context Builder"]
    LLMService["Gemini API Service (@google/genai)"]
    MemoryStore["Memory Store Manager"]
  end

  subgraph Persistence_Layer ["永続化・コンテキスト"]
    Redis[("Upstash Redis (Production State)")]
    LocalFiles["Local Markdown Files (Dev Mode / Config)<br/>- USER_PROFILE.md<br/>- patterns.md<br/>- daily/*.md"]
  end

  subgraph External_APIs ["外部サービス"]
    GeminiAPI["Google Gemini API"]
  end

  %% Data Flow
  User -->|メッセージ送信| LineAPI
  LineAPI -->|Webhook HTTPS Post| WebhookHandler
  
  %% Cron triggers
  WebhookHandler -->|1. コンテキスト取得依頼| MemoryStore
  MemoryStore -->|読込/書込| Redis
  MemoryStore -->|設定・履歴の読込| LocalFiles
  
  MemoryStore -->|2. 未加工データ取得| ContextBuilder
  ContextBuilder -->|"3. プロンプト組み立て (HP考慮)"| LLMService
  LLMService -->|4. 推論要求| GeminiAPI
  GeminiAPI -->|5. テキスト返却| LLMService
  LLMService -->|6. 返信/プッシュ送信| LineAPI
  LineAPI -->|メッセージ配信| User
  
  %% Scheduled Cron
  CronScheduler["Deno Deploy Cron Job<br/>(朝 / 夜 / 定期プッシュ)"] -->|HTTP Trigger| WebhookHandler
```

---

## 🛠️ 技術スタック

* **Runtime**: Deno v2+ / TypeScript
* **Web Framework**: Hono
  * 軽量かつエッジ/サーバーレス環境で高速動作し、型安全なルーティングを実現。
* **Serverless Platform**: Deno Deploy
  * Deno Deploy のエッジランタイムと GitHub Actions のスケジュールトリガーを活用したイベント駆動型実行モデル。
* **Database / Cache**: Upstash Redis (Serverless Redis)
  * コネクションプールを必要としない REST API 経由の接続（HTTP-based Redis client）により、サーバーレス環境でのコールドスタート耐性を向上。
* **LLM Engine**: Google Gemini API (`gemini-3.1-flash-lite`) via `@google/genai`
* **SDK / API Integration**: Telegram Bot API (fetch 直接呼び出し、SDK 不要)

---

## 📂 主要なコード構成

```text
├── src/
│   ├── index.ts          # Hono アプリの初期化とルーティング定義
│   ├── routes/           # Webhook および Cron トリガーのルートハンドラー
│   └── services/
│       ├── contextBuilder.ts # プロンプトテンプレートへのコンテキスト合成
│       ├── llm.ts            # Gemini API クライアントと推論処理
│       └── memoryStore.ts    # Redis とローカルファイルを抽象化した永続化ロジック
├── memory/               # ローカル保存用 Markdown データベース
│   ├── USER_PROFILE.md   # ユーザープロフィール・ペルソナ
│   ├── patterns.md       # HP別のコーチング基準・行動ポリシー
│   └── daily/            # 日々の生ログやタスク進捗ファイル
└── .github/workflows/coaching-cron.yml # GitHub Actions による Cron スケジュール

---

## 🚀 開発環境のセットアップ

本リポジトリは Deno と TypeScript を用いて管理されています。

### 1. リポジトリの準備
```bash
git clone <repository-url>
cd YourSpartanCoach
deno task dev   # 依存は Deno が自動解決（npm: 指定インポート）
```

### 2. 環境変数の設定
`.env.example` を参考に、プロジェクトルートに `.env` もしくは `.env.local` を作成し、各クレデンシャルを記述します。

```env
# Server Config
PORT=3000

# Telegram Credentials
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_USER_ID=your_user_id
TELEGRAM_WEBHOOK_SECRET=your_long_random_secret

# Google Gemini API
GEMINI_API_KEY=your_gemini_key

# Upstash Redis (Deno Deploy 環境での状態永続化用)
UPSTASH_REDIS_REST_URL=your_redis_url
UPSTASH_REDIS_REST_TOKEN=your_redis_token
```

### 3. ローカル実行
```bash
deno task dev
```
ローカルサーバーが起動します。外部からの Webhook 受信を確認するには `ngrok` や `localtunnel` を介してローカルポート（デフォルト: 3000）を公開してください。

### 4. Deno Deploy へのデプロイ
Deno Deploy の `deployctl` を用いて本番デプロイを行います。
```bash
deno task deploy
# または明示的に
deno run -A jsr:@deno/deployctl deploy --env-file=.env --prod
```
環境変数 `TELEGRAM_BOT_TOKEN`, `TELEGRAM_USER_ID`, `TELEGRAM_WEBHOOK_SECRET`, `GEMINI_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` を Deno Deploy のプロジェクト設定（Environment Variables）で設定します。

> 定時・定期のコーチングプッシュ（朝 / 夜 / 進捗 / 入浴リマインダー）は、GitHub Actions の `.github/workflows/coaching-cron.yml` が Deno Deploy の `/cron/*` エンドポイントを `CRON_SECRET` で認証して叩くことで実行されます。Deno の `Deno.cron()` ではなく GitHub Actions のスケジュールトリガーを採用しています。

---

## 📄 ライセンス

MIT License
