# Feature Specification: 常時Agentモード・旧一問一答の廃止

**Feature Branch**: `feat/p1-012-p2-018-p2-019-p3-016` | **Spec Folder**: `specs/P1-012` | **Created**: 2026-10-03

**Status**: Draft

**Input**: [P1-012 backlog item](../000_backlog/items/P1-012-always-agent.md)

> **背景:** Agentモード（P3-010）と通常チャットが併存し保守・UXが分散している。新規会話は既に `agentMode: true` 既定で切替UIも廃止済み（`conversationService.ts:124-125`）のため、残存する通常チャット系コードの削除が本体となる。

## User Scenarios & Testing

### User Story 1 - 常にAgentモードで会話が始まる (Priority: P1)

ユーザーが新規チャットを開始すると、常にAgentモードの会話が作成される。モデル選択やモード切替を意識する必要がない。

**Independent Test**: 新規チャット作成→送信し、backend が `handleAgentChat` 経路で処理されることを確認できる。

**Acceptance Scenarios**:

1. **Given** 会話一覧表示中、**When** 新規チャットを開始する、**Then** `agentMode: true` の会話が作成され、Agentが応答する
2. **Given** 任意の会話、**When** モデル選択ドロップダウンを探す、**Then** 通常チャット用のモデル選択UIは存在しない

### User Story 2 - 旧一問一答の導線が存在しない (Priority: P1)

通常チャットのUI・APIが削除され、ユーザーが旧形式に戻れない。残骸（到達不能UI・未使用API・ドキュメント記述）がない。

**Independent Test**: 削除対象のエンドポイント・UI要素が存在しないことをテスト・目視で確認できる。

**Acceptance Scenarios**:

1. **Given** 削除完了後、**When** `PUT /conversations/{id}/model` を呼ぶ、**Then** エンドポイントが存在しない
2. **Given** 削除完了後、**When** `PUT /conversations/{id}/agent-mode` を呼ぶ、**Then** エンドポイントが存在しない
3. **Given** 削除完了後、**When** チャット画面を開く、**Then** ヘッダーのモデル選択ドロップダウンが存在しない

### User Story 3 - 既存会話の履歴が閲覧できる (Priority: P2)

旧通常チャットで作られた会話（`agentMode: false`）が存在しても、履歴閲覧は引き続きできる。送信は現行Agentに誘導する。

**Independent Test**: `agentMode: false` の会話データを用意し、GET系が動作すること、送信がブロックされることを確認できる。

**Acceptance Scenarios**:

1. **Given** `agentMode: false` の既存会話、**When** 会話を開く、**Then** 履歴メッセージが閲覧できる
2. **Given** `agentMode: false` の既存会話、**When** メッセージを送信する、**Then** 送信できずAgent会話への移行が案内される（方式は実装時に確定）

## Edge Cases

- **本番データに `agentMode: false` 会話が存在するか**: 未確認。存在する場合は閲覧専用＋移行案内、存在しない場合は完全削除。dev/prod実査で確定する
- **画像添付**: 現行パイプラインは通常チャット専用（agent経路は画像を拒否）。通常チャット削除に伴い画像添付UIも削除する（要オーナー確認の判断点）
- **`conversation.model` フィールド**: 作成時フォールバック（`DEFAULT_MODEL_ID`）とメッセージ表示名解決（`ChatMessage.tsx`）で参照があるため、フィールド自体は残す。書き込み経路のみ削除する
- **`GET /api/models`**: メッセージのモデル名表示解決に使うため残す（P2-019と連携）
- **削除後の小残骸**: `ConversationList` の `agentMode` バッジ、`App.tsx` の `agentMode` 条件分岐、`useConversations` の `updateAgentMode` ラッパ、`chat.ts` の不要化する import（`streamChat`・`getModelConfig`・`formatMessagesForApi` 等）も除去対象とする（NFR-002）
- **P2-019 FR-007（削除モデル409）との関係**: 削除モデル判定の409は通常チャット分岐内にあり、本件適用後は当該経路ごと消滅する。P2-019適用時点では有効だが、本件適用後は FR-009 の送信不可（`agentMode: false` 会話は一律送信不可・不保存）に吸収される。実装順序は P2-019→P1-012 を想定し、P2-019側にも陳腐化を記録する
- **P2-008の既定モデル設定**: 通常チャットの新規会話モデル seeding に使われていた。Agent実行モデル（`agentModel`/`agentSubagentModel`）は別系統のため残す。`defaultModel` 設定項目自体は削除対象とする（要オーナー確認の判断点）
- **外部クライアント**: `PUT .../agent-mode` のリポジトリ外利用は未確認。利用なしとみなして削除する

## Requirements

### Functional Requirements

- **FR-001**: 新規会話は常に `agentMode: true` で作成されなければならない（現行動作を維持）
- **FR-002**: ヘッダーの通常チャット用モデル選択ドロップダウン（`AppLayout` のモデル選択UI）を削除しなければならない
- **FR-003**: `draftModel` の state と配線（`App.tsx`、`AppLayout` の props）を削除しなければならない
- **FR-004**: `updateModel`（`useConversations.ts`）・`updateConversationModel`（`chatApi.ts`）・`PUT /conversations/{id}/model`（`modelHandler`）を削除しなければならない
- **FR-005**: `PUT /conversations/{id}/agent-mode`（`agentModeHandler`）と `updateConversationAgentMode` を削除しなければならない
- **FR-006**: 会話作成時の `model` 読取・検証（`conversationsHandler` POST `:112-121`）を削除し、`agentMode: true` 固定で作成しなければならない（`model` フィールドへのフォールバック書込みは残してよい）
- **FR-007**: `chatHandler` の通常チャット分岐（`createResponseStream` 経路。画像形式チェックの400判定含む）を削除し、Agent経路のみにしなければならない
- **FR-008**: `MOCK_RESPONSE` ブロック（`chat.ts` のモック応答定義・使用箇所）を削除しなければならない
- **FR-009**: `agentMode: false` の既存会話は履歴閲覧可・送信不可としなければならない。送信時は 409 系エラー＋新規Agent会話への案内表示とし、user メッセージを保存してはならない（保存前の fail fast。P2-019 FR-007の不保存規約と同型）。「移行」はデータ移行ではなく新規Agent会話への案内を指す
- **FR-010**: Agent経路（`handleAgentChat`・承認フロー・`agent.ts`・Agent UI）に退行があってはならない
- **FR-011**: J1＝削除の場合、画像パイプライン（`ChatInput` の画像UI、`utils/image.ts`、`ChatMessage` の imageUrl 表示、`types` の `imageUrl`/`imageBase64`、両経路の画像400、`formatMessagesForApi` の画像構築）を削除しなければならない

### Non-Functional Requirements

- **NFR-001**: 削除後の `npm test`（frontend・functions）と `tsc` ビルドが green でなければならない
- **NFR-002**: 到達不能コード・未使用 import・旧記述のドキュメント残骸を残してはならない

## Success Criteria

- **SC-001**: 通常チャットのUI・API導線が存在せず、テストで固定される
- **SC-002**: 新規会話が常にAgentモードで動作する
- **SC-003**: 既存会話の履歴閲覧に退行がない
- **SC-004**: Agent承認フロー・通常の送受信に退行がない

## Out of Scope

- Agent実行モデル（`agentModel`/`agentSubagentModel`）の選定UI・設定の変更
- P2-019（カタログ内容自体の更新。消費者削減との整合のみ）
- 会話データの移行ツール（閲覧可・送信不可で対応）

## Assumptions

- 本番に `agentMode: false` 会話が残っていても閲覧専用で許容される
- 画像添付・`defaultModel` 設定の削除はオーナー承認済み（下記判断点を参照）
- リポジトリ外から削除APIを利用しているクライアントはない

## 要オーナー確認の判断点

- **J1**: 画像添付UI（P1-001成果物）を通常チャットと一緒に削除してよいか
- **J2**: ユーザー設定の `defaultModel` 項目を削除してよいか（Agent実行モデル設定は残す）
