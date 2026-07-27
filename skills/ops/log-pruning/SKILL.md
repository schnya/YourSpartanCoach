---
name: log-pruning
description: ログの取得および不要データの枝払い（スクレイピング・クリーンアップ）を実行します。「ログを取得して」「ログを掃除して」「pull and prune」「log pruning」と言われた場合に呼び出します。
---

# Log Pruning & Sync Skill

このスキルは、Vercel/本番環境からログを取得し、ローカルの不要ログ・古いデータを整形・枝払い（Prune）するための運用手順を提供します。

## 使用するスクリプト

- [scripts/pullAndPrune.sh](file:///Users/schnya/experiments/YourSpartanCoach/scripts/pullAndPrune.sh): ログの同期と枝払いを一括実行するシェルスクリプト。

## 実行手順

1. 以下のコマンドを実行してログの pull および prune を行います。

```bash
bash scripts/pullAndPrune.sh
```

2. 実行結果のログ（[logs/](file:///Users/schnya/experiments/YourSpartanCoach/logs) または `reports/`）を確認し、エラーが発生していないか検証します。
