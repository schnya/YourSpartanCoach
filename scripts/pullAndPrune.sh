#!/usr/bin/env bash
# 本番 (Deno Deploy / Upstash Redis) の日別ログをローカルへ pull し、
# 保持期間を超えた古いログを prune する。Hermes cron job から呼ばれる。
set -euo pipefail
cd /Users/schnya/experiments/YourSpartanCoach
node scripts/pullLogs.mjs
node scripts/pruneLogs.mjs
