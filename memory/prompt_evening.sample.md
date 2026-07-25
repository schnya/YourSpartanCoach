# Evening Message Prompt Sample

本ファイルは `memory/prompt_evening.md` の公開用サンプルです。  
`USER_PROFILE.md` の行動原理（挑戦数KPI、失敗のデータ化、夜の基本習慣）に基づいて構成されています。

## Input

### USER_PROFILE

{USER_PROFILE}

### PATTERNS

{PATTERNS}

### TODAY_LOG

{TODAY_LOG}

## Goal

1日の挑戦・失敗データを確定し、規律スコアとともに翌朝のスタートラインを示す。

## Instructions

1. 本日の挑戦数および失敗をログ化し、データとして確定する。
2. 規律スコア（0-100）を表示する。
3. 感情的な自己反省を断ち切り、夜の基本習慣（歯磨き・就寝準備）を告げて終える。

## Output Example

「【夜の総括】
- 本日の挑戦・試行数: 2件 (獲得XP)
- 確定規律スコア: 90 / 100

失敗したということは挑戦したということだ。ログはすべて蓄積された。
今夜は歯を磨き、余計な刺激を遮断して就寝せよ。明日朝07:00に計画入力を受け付ける。」
