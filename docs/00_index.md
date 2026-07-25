---
title: "ARES Document Index (MOC)"
tags: [dev-seed, rhythm, line-bot, spartan, ares, moc]
status: active
type: spec
---

# **AIを活用した24時間監視・スパルタ型ライフコーチング「ARES」仕様書**

## **0. 設計背景とコンテキスト（Personal Context）**
- **開発動機・課題意識**: 意志力に頼る従来の習慣化ツールの限界を突破し、「現在志向バイアス（Present Bias）」や「双曲割引（Hyperbolic Discounting）」による先延ばしを構造的に防止する。
- **文脈（#filter）**: 生活リズム（`#rhythm`）および個人開発（`#dev-seed`）において、強力な強制力を持つ伴走構造（Commitment Device）をLINE Bot上で構築する。

---

## **📚 仕様書インデックス (Map of Content)**

1. [[01_framework|01. 概念フレームワークと行動経済学的基盤]]
   - コミットメント・スタック（環境的・社会的・経済的）
   - 50分集中ブロック管理と高頻度PDCA
2. [[02_ux_architecture|02. LINE Bot UI/UX アーキテクチャ & 状態遷移 (FSM)]]
   - リッチメニュー配置と定刻単発通知（追いLINE無しの原則）
   - 有限状態機械（FSM: IDLE, SCHEDULED, EXECUTING, REPORTING, ESCAPED）
3. [[03_system_prompt|03. システムプロンプトおよびAIエージェント構造設計]]
   - モジュール分離型アーキテクチャ（Task Router）
   - Radical Candor（徹底的な愛ある直言）と潜在空間活性化
   - PII保護とメンタルヘルス・セーフティネット
4. **プロダクション仕様プロンプト群**
   - [[04_prompts/master|04.1 マスター・システムプロンプト (ARES)]]
   - [[04_prompts/state_idle|04.2 モジュールA (STATE: IDLE / 朝宣言)]]
   - [[04_prompts/state_scheduled|04.3 モジュールB (STATE: SCHEDULED / 開始確認)]]
   - [[04_prompts/state_reporting|04.4 モジュールC (STATE: REPORTING / 成果物審査)]]
   - [[04_prompts/state_escaped|04.5 モジュールD (STATE: ESCAPED / 逸脱・ペナルティ)]]

---

## **5. 結論および運用・計測指標（KPI/KGI）**

運用フェーズにおいては、以下の指標を追跡し、システムパラメーターの最適化を実施する。

| 指標カテゴリ | 測定指標（Metric） | 目標水準（Target） | 指標の意義および最適化アプローチ |
| :---- | :---- | :---- | :---- |
| **行動挑戦（KGI）** | **日次挑戦数 (Challenge Count)** | **3件 / 日 以上** | 50分集中ブロック単位の新規アウトプット・実験の遂行回数。 |
| **コンフォート突破** | **週次越境数 (Crossing Count)** | **2件 / 週 以上** | 未知のコミュニティ・案件・人物への接触・応募・提案回数。 |
| **試行学習ノルマ** | **週次失敗数 (Failure Quota)** | **5件 / 週 以上** | 拒絶・不合格・エラーログの獲得数。**週0件は保身罪（-10点減点）**。 |
| **監視応答性** | **開始通知反応時間（MTR）** | **3分 以内** | プッシュ通知から「開始」をタップするまでの平均時間。遅延時は文面を強化。 |
| **復帰力** | **逸脱後リカバリー率（RRR）** | **70% 以上** | 1度タスクをスキップしたユーザーが24時間以内に復帰する割合（連鎖的挫折防止）。 |