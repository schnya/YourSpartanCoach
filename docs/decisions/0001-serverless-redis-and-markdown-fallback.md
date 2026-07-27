# ADR 0001: Upstash Redis と ローカル Markdown による二層永続化アーキテクチャ

## Status
Accepted

## Context
Vercel などの Serverless Functions はステートレス（Ephemeral）で実行されるため、LINE Bot の継続的対話状態やユーザー設定、日次対話ログをインメモリに保持することができません。
一方で、開発環境やローカルテストにおいて外部 Redis サービスへ常時依存すると、オフライン開発やテストの高速フィードバックが阻害されます。

## Decision
永続化レイヤー（[src/shared/memory/](file:///Users/schnya/experiments/YourSpartanCoach/src/shared/memory)）に **Upstash Redis** と **ローカル Markdown ファイル** の二層フォールバック機構を導入します。

1. **本番環境 (Production)**: Upstash Redis (HTTP REST Client) を優先利用。コールドスタートの影響を最小化し、永続ステート管理を実現。
2. **開発環境 (Development/Fallback)**: Redis 接続がない場合は、ローカルの `memory/` ディレクトリ内の Markdown ファイル（`USER_PROFILE.md`, `daily/*.md`）にフォールバック。

## Consequences
- **Positive**: サーバーレス環境でのコールドスタート耐性が上がり、ローカル開発も完全オフラインで動作可能。
- **Negative**: Redis と Markdown 間でフォーマットや読み書き同期を抽象化維持するコストが発生する。
