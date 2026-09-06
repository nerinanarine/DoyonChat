# Phase 1 実装メモ（進捗中継＋承認フロー＋設定）

**期間**: 2026-09-04 | **Branch**: `feat/p3-010-ai-agent` | **Review gate**: RG-1（reviewer・読み取り専用）→ **条件付きGO（Phase 2 着手可）**

## 成果物

- gateway: 実行レジストリ＋`GET /runs/:id`、承認中継＋`POST /approve`（run 名前空間・タイムアウト自動拒否）、heartbeat、graceful abort、同時実行上限（既定4・429）、SSE 正規化（text/thinking→`{content}`/`{reasoning}`）、承認レベル env 注入、承認ゲート欠落時の fail-closed、`--extension` 自動付加
- 承認ゲート pi 拡張 `agent/src/extensions/approvalGate.ts`（confirm 専用。レベル・危険ツール表は env 注入）
- Functions: `agent.ts`（approve/runs プロキシ＋kill switch）、`agentGateway.ts`（fetch タイムアウト付き）、設定3キー＋sanitize＋PATCH 検証
- フロント：`AgentProgress`・`ToolCallConfirmation` 新規、`useChat`/`chatApi`/`useSettings`/`SettingsMenu` 拡張

## 検証

- agent jest **44/44**、functions jest **188/188**、frontend vitest **137/137**（3スイートとも親が再実行済み）
- docker build＋`/health` 疎通（Phase 0 から継続）

## RG-1 指摘と対応

- F1 must-fix（text/thinking 変換未実装・チェック実態不一致）→ `normalize.ts` で正規化実装＋テスト。残部（`/chat` エージェント分岐・P1-003 接続）は Phase 2 へ（plan に明記）
- F2/F8（承認待ちの timeout 算入・events 上限）→ Phase 2 上限設計へ
- F3（非 confirm 中継）→ confirm のみ中継に修正済み
- F4（ゲート欠落の無言許容）→ fail-closed（起動拒否）に修正済み
- F5（gateway Authorization 未検証）→ Phase 3 bicep 項目へ（露出前必須）
- F6（所有者検証なし）→ Phase 2 セッション対応で閉じる（計画通り）
- F7（forward fetch タイムアウトなし）→ `AbortSignal.timeout(30s)` 追加済み
- F9（レベル未配線）→ gateway 側注入（`/prompt` body）実装済み。Functions 側転送は `/chat` 分岐と同時（Phase 2）
- F10（ツール実名一致）→ Phase 2 allowlist 項目へ。F11（confirm 待ち中 abort）→ Phase 2 検証項目へ
