# Habit-Formation Specialization

「やりたいことはあるが行動が続かない」層に特化した習慣化コーチへの再焦点化設計です。最上位指標を **総挑戦数（North Star Metric）** に据え、自己批判の緩和と超スモールステップで「踏み出す回数」を最大化します。医療行為は一切行いません。

詳細な実装タスク・KPI 計算式・テスト要件は `docs/habit-formation-spec.md` に集約しており、他 AI エージェントへそのまま共有できます。本ファイルは設計意図とコードアンカーのナレッジグラフです。

## Design Thesis

この層の最大の敵は「できなかった日の自己批判（What-the-Hell Effect）」であり、怠惰ではありません。従ってコーチは (a) 次の一歩のハードルをほぼゼロに下げ、(b) 未達日の罪悪感を無効化して「1回の挫折がリラプス全体に広がる」のを防ぎます。

3理論は**異なるレイヤー**に位置します。Self-Compassion は「失敗した自分への向き合い方（態度）」、Tiny Habits は「行動を始めやすくする設計（方法）」、Implementation Intentions は「特定の場面で自動的に動く計画（トリガー）」です。全て「意志の力だけに頼らない」発想で重なりますが、ユーザーの提示（自己責め／重さ／忘れ）に応じて**使い分ける**のが設計の核心です（ルーティング表は `docs/habit-formation-spec.md` §1 参照）。

理論的基盤は Self-Compassion (Neff 2022 Annual Review / 2003)、Tiny Habits (Fogg 2019)、Implementation Intentions (Gollwitzer & Oettingen 2019)、Motivational Interviewing の是認・Change Talk です。

## Conversation Flow (4-Step Loop)

ユーザー投稿は `[[src/features/webhook-reply/messageHandlers.ts#handleUserLogMessage]]` で「記録」として扱われるため、コーチはその後に対応ステップで返信します。

1. **Listen（傾聴）** — できた/できなかったを非評価で受容。
2. **Affirm（承認）** — 未達日の罪悪感を無効化（来られた事実の是認）。
3. **Powerful Question（パワフルな質問）** — ハードルを「バカバカしいほど低く」再設定。
4. **Today's One Step（今日の一歩）** — If-Then プランニングで習慣トリガーをセット。

未達報告後はステップ 2–4 が必須。達成報告は 1＋軽い 2 のみ。

## Safety Guardrails (Non-Clinical Boundary)

診断・ラベル貼り（うつ/ADHD 傾向）、トラウマ深掘り、認知矯正は禁止。未来的行動・環境調整・事実の是認のみ。既存の `[[src/features/spartan-context/spartanPrompts.ts#MASTER_SYSTEM_PROMPT]]` の `Guardrails & Safety Override` を引き継ぎ、新たに `SAFETY_GUARDRAILS` 定数を全プロンプトへ付与します。

## KPIs & Measurement

最上位指標（North Star Metric）は **総挑戦数（Total Challenge Count）** です。ユーザーが恐怖や挫折を超えて「やってみた」回数の累計（1行読んだ・1分歩いたも1挑戦）。継続率・Bounce-Back Rate はこれを積み重ねた**副産物**として位置づけます（`docs/habit-formation-spec.md` §4）。

サブ指標は **新規挑戦率（New Experiment Rate）**。Bounce-Back Rate は**副産物**として 3日ウィンドウ（Lally 2010・週末緩衝）で測ります。90日レポートは「挑戦のコレクションアルバム」として**ハイブリッド配信**（90日目の自動プッシュ祝福 ＋ いつでも閲覧）します（`docs/habit-formation-spec.md` §4）。

計算は `[[src/shared/memory/dailyLogStore.ts#readDailyLog]]` と `[[src/shared/memory/fsmStore.ts#getUserState]]`（`repliedToday` / `lastUserReplyAt`）から導出し、新モジュール `[[src/shared/memory/habitMetrics.ts]]`（`computeTotalChallengeCount` / `computeNewExperimentRate` 等）が集約します。

## Required Code Changes

実装すべき変更の要点です。完全なタスクリスト・関数シグネチャ・テスト要件は `docs/habit-formation-spec.md`（§5, §6, §7）に集約しています。

- `MASTER_SYSTEM_PROMPT` から「鬼軍曹トーン（高スコア＝厳格）」ルールを削除し、一律の共感的ベースラインへ。同時に **Discipline Score → `Momentum`（挑戦のはずみ）へリネーム**: 内部キー `discipline_score` は維持し `momentum_score` エイリアスを追加（破壊的変更回避）、プロンプト変数は `{{DISCIPLINE_SCORE}}` → `{{MOMENTUM_SCORE}}` へ（spec §5.1）。
- 4ステップループと `SAFETY_GUARDRAILS` を `spartanPrompts.ts` へ追加し `[[src/features/spartan-context/contextBuilder.ts#buildSpartanPrompt]]` へ注入。
- `src/shared/memory/habitMetrics.ts` を新規作成（純関数で 総挑戦数・新規挑戦率・Bounce-Back Rate 等を計算）。
- 注意: `spartanPrompts.test.ts` の「鬼軍曹/理学療法士」含有アサートは削除必須。
