# ADR 0002: Vertical Slice（垂直スライス）構成の採用と LLM コンテキスト最適化

## Status
Accepted

## Context
従来の層別構成（`routes/`, `services/`, `handlers/`）では、1つの機能（例: LINE Webhook 応答）を変更・テスト・デバッグする際に、LLM（コーディングエージェント含む）がプロジェクト全体の複数ディレクトリを探索し、トークン消費が増大する課題がありました。

## Decision
リポジトリのソースコード (`src/`) を **Vertical Slice（機能別垂直スライス）** 構成へ移行します。

1. **`src/features/`**:
   - `webhook-reply/`: LINE メッセージ受信・返信
   - `cron-push/`: 朝・夜の定時プッシュ配信
   - `spartan-context/`: プロンプト生成・コンテキスト合成
2. **`src/shared/`**:
   - `llm.ts`, `memory/`: 全機能共通のコア基盤
   - `integrations/google-tasks/`: サードパーティ連携モジュール

## Consequences
- **Positive**: 1タスクあたりの LLM 参照ファイル範囲が 1 スライスに閉じ、コンテキスト窓の節約と修正精度の向上が実現。
- **Positive**: 機能間の水平依存が防止され、モジュールごとの独立性が向上。
- **Negative**: 機能間で共通ロジックを抽出する際に `shared/` への適切な分離判断が必要となる。
