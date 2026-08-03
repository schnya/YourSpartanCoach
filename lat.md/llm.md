# LLM Integration

Google Gemini API を活用し、ユーザーの状態に応じた動的な伴走メッセージやタスク優先度の分析を生成する LLM 連携レイヤーです。

[[src/shared/llm.ts]] および [[src/features/spartan-context/contextBuilder.ts]] を中心に、推論クライアントとコンテキスト構築機能が実装されています。

## State-Adaptive Prompting

ユーザーの直近のエネルギー状態や FSM 状態に合わせて、プロンプトのトーンやタスク合格ラインを動的に変更する仕組みです。

[[src/features/spartan-context/contextBuilder.ts#buildSpartanPrompt]] にて、現在の FSM 状態（IDLE/ACTIVE）に対応する専用の軽量サブプロンプト（Morning, Evening, Progress）をマスターシステムプロンプトに動的注入し、指示の緩み（Instruction Drift）を防止する Task Routing 構造を提供します。また「追いLINE無しの原則（Non-Chase Policy）」をプロンプト規則として組み込んでいます。

> **習慣化特化への移行:** トーンは一律で「共感的・スモールステップ」に統一されました。かつての「規律スコア高 → 鬼軍曹トーン」のような自己批判を助長し得るグラデーションは廃止されています。詳細は [[habit-formation|習慣化特化設計]] を参照。

## Gemini API Client

Google の SDK を用いて、Gemini モデルに対して単一テキストまたはマルチモーダル（画像＋テキスト）の推論要求を送り、結果を受け取るためのインターフェースです。

[[src/shared/llm.ts#generateMessage]] は `@google/genai` の `GoogleGenAI` クライアントを使用して `gemini-3.1-flash-lite` にリクエストを送信し、画像付き証拠の検証時には [[src/shared/llm.ts#generateMessageMultimodal]] を介して `gemini-2.5-flash` などに画像バイナリと評価基準を投入して厳密な合格・不合格判定（PASS/FAIL）を実施します。
