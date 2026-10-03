# P3-014 Phase 2 実装メモ（移譲ルーティング＋フロント表示）

**期間**: 2026-09-06 | **Branch**: `feat/p3-014-agent-web-access` | **状態**: Phase 2 完了（RG-2 レビュー待ち）

## 結論

- 移譲ルーティング（researcher 引き当て）は **Phase 1b の live 検証＋Phase 2 の再確認**で成立。LLM の引き当ては自動テストでは決定的に検証できないため、パイプライン（SSE 正規化→表示）をユニットテストで、実引き当てを live で確認した
- gateway は `tool_execution_start/update/end`（`toolName:"subagent"`、`args.agent`/`args.task` 付き）を **既に SSE に放出している**（P3-010 の raw パススルー実装。変更不要）
- Functions は `createAgentResponseStream` の `sseRaw` パススルーで **既に中継している**（変更不要）
- フロント表示が唯一の実装変更。`AgentProgress`/`normalizeAgentEvent`/型を拡張し、subagent イベントを「移譲先・タスク概要・実行中／完了／失敗」として描画する

## FR-4（移譲ルーティング）の確認

- Phase 1b live（前述メモ): researcher 移譲→web_search 完走。`tool_execution_start` の `args.agent === "researcher"` で引き当て確認済み
- Phase 2 live（2026-09-06、gateway ローカル／`--tools subagent`）: 再確認で
  - `agent_start: 1` / `tool_execution_start(subagent): 1`（agent=`researcher`）/ `tool_execution_update: 122` / `tool_execution_end: 1` / `approvalRequest: 0` / `done: true`
- LLM による引き当ては確率的なためユニットテストにできない。パイプライン側（サブエージェントイベントの抽出・描画）をテストで固定し、実引き当ては live で担保する方針。researcher 定義の description・AGENTS.md 調整は **不要と判断**（Phase 1b・2 とも標準 researcher が正しい agent を引き当てた）

## FR-7（フロント表示）の実装

変更ファイル（すべて frontend、後方互換維持）:

- `frontend/src/types/index.ts`: `AgentStreamEvent` の tool 系に `agent`（移譲先）・`task`（タスク概要）を追加（任意フィールド。既存の kind は不変）
- `frontend/src/services/chatApi.ts`:
  - `subagentInfo()`: `toolName==='subagent'` のイベントから `args.agent`・`args.task` を抽出
  - `normalizeAgentEvent()`: tool_start/update/end に agent/task を載せる。**tool_execution_end は args を持たない**（pi 実測）ため、同一 `toolCallId` の start/update で記録した agent 名を `Map` で引き継ぐ
  - `streamChat()`: ストリーム単位の `Map<toolCallId, agent>` を維持
- `frontend/src/components/Chat/AgentProgress.tsx`:
  - subagent イベント専用行を新設
    - start: 「サブエージェントへ移譲: researcher（タスク概要）」
    - update: 「サブエージェント実行中: researcher」
    - end: 「サブエージェント完了/失敗: researcher」
  - 非 subagent ツールは従来どおりの行（回帰なし）。違うのは表示のみで、SSE 契約・`useChat` のイベント列は不変

## 承認なしの確認

- Phase 2 live で `approvalRequest: 0`（移譲・実行とも確認ダイアログなし）。Phase 1b と同結果

## テスト

- `frontend/tests/unit/chatApi.agent.test.ts`: subagent イベントの agent/task 抽出＋toolCallId 引き継ぎ（start→end）を追加
- `frontend/tests/unit/AgentProgress.test.tsx`（新規）: 移譲・実行中・完了・失敗・非 subagent 回帰の描画を追加
- スイート結果: frontend **157 green**（従来 153）、agent **106 unit＋real green**（real は単体実行で green。複数同時実行時の起動 contention による既知 flake。Phase 2 変更なし）、functions **219 green**

## 変更なし（方針判断）

- `agent/*`: raw パススルーがそのまま subagent ライフサイクルイベントの放出元（変更不要）
- `functions/*`: `sseRaw` パススルーが中継（変更不要）
- researcher 定義の description・AGENTS.md: 調整不要（live で引き当て成立）

## 残課題（Phase 3 へ）

- dev デプロイ後の実ブラウザ表示確認（E2E は Phase 3）
- `AGENT_TOOLS_FILE` 既定への `subagent` 追加タイミング（ユーザー確認事項。未変更のため配線は既定では発火しない＝既存挙動どおり）

---

## 変更履歴

| 日付 | ステータス | 備考 |
|------|-----------|------|
| 2026-09-06 | Phase 2 完了 | FR-4 確認＋FR-7 実装＋3 スイート green |