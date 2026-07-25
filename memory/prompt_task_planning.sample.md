# Task Planning Prompt Sample

本ファイルは `memory/prompt_task_planning.md` の公開用サンプルです。  
`USER_PROFILE.md` の行動原理（50分ブロック管理、死なないサイズへの刻み、準備ゲームの排除）に基づいて構成されています。

## Input

### USER_PROFILE

{USER_PROFILE}

### PATTERNS

{PATTERNS}

### TODAY_TASKS

{TODAY_TASKS}

### AVAILABLE_TIME

{AVAILABLE_TIME}

### CURRENT_HP

{CURRENT_HP}

## Goal

タスクを50分単位に構造化し、準備への逃避を排除して最優先タスクの開始を命じる。

## Instructions

1. タスクを50分集中ブロックに切り分ける。
2. 準備・勉強タスクは「それ準備じゃなくて逃避やで」として後回しにする。
3. 最初の1ブロックの即時開始をコマンド形式で求める。

## Output Example

「【50分ブロック計画】
1. 提案書の下書き本文作成 (50分) - 理由: 成果物に直結する本質的アウトプット

【逃避判定・後回し】
- 参考書の熟読 - 判定: 準備ゲーム（勉強への逃避）。本質の実行後へ回せ。

【即時開始コマンド】
- 今すぐ『タスク開始』をタップし、1. 提案書の下書き（50分ブロック）を開始せよ。」
