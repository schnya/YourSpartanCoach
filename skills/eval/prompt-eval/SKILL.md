---
name: prompt-eval
description: スパルタコーチのプロンプト構文やContext Builderの動作評価・回帰テストを実行します。「プロンプトのテストをして」「プロンプト評価」「eval prompt」「test context builder」と言われた場合に呼び出します。
---

# Prompt Evaluation & Test Skill

このスキルは、スパルタコーチのプロンプト構築ロジック（`spartan-context`）および動的変数の差し込みが正常に行われるか検証するための手順です。

## 評価手順

1. ディレクトリ再編後のプロンプト・コンテキスト構築テストを実行します。

```bash
deno test -A src/features/spartan-context/
```

2. 評価項目:
   - 朝のコンテキスト（`MORNING`）に Google Tasks が正しく組み込まれるか。
   - 夜のコンテキスト（`EVENING`）に 当日の行動ログがマージされるか。
   - 非追撃ルール（Non-chase policy）などの重要制約プロンプトが含まれているか。
