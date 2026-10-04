# Feature Specification: Agent実行モデル選択ドロップダウン（Pi model連動）

**Feature Branch**: `feat/p1-012-p2-018-p2-019-p3-016` | **Spec Folder**: `specs/P1-013` | **Created**: 2026-10-04

**Status**: Draft

**Input**: [P1-013 backlog item](../000_backlog/items/P1-013-agent-model-selector.md)

> **背景:** P1-012で通常チャット用のモデル選択を削除したが、Agent実行モデルの選択UIは必要との方針変更。オーナー決定済み：選択肢は正規30モデル全体、既定は設定画面でユーザー設定の `agentModel` に連動、会話ごとの変更はヘッダーで可能。

## User Scenarios & Testing

### User Story 1 - 既定モデルを設定画面で選ぶ (Priority: P1)

ユーザーが設定画面で既定のAgent実行モデルをドロップダウンから選択する。選択肢は正規30モデル。保存後は `agentModel` 設定として保持される。

**Independent Test**: 設定画面でモデルを選択→保存し、設定取得で反映されることを確認できる。

**Acceptance Scenarios**:

1. **Given** 設定画面を開いた状態、**When** 既定モデルのドロップダウンを見る、**Then** 正規30モデルが一覧表示される
2. **Given** モデルを選択した状態、**When** 保存する、**Then** `agentModel` 設定に反映され、次回以降の会話で使われる
3. **Given** 不正なモデル値、**When** 保存する、**Then** 拒否される

### User Story 2 - 会話ごとにヘッダーで変更する (Priority: P1)

ユーザーが会話ごとの実行モデルをヘッダーのドロップダウンで変更する。会話に保存され、切替えても維持される。未設定の会話は既定モデルを使う。

**Independent Test**: 会話Aで変更→会話Bで別値→会話Aに戻って維持されることを確認できる。

**Acceptance Scenarios**:

1. **Given** 会話を開いた状態、**When** ヘッダーのドロップダウンでモデルを変える、**Then** その会話の実行モデルになる
2. **Given** override済みの会話と未設定の会話、**When** 行き来する、**Then** override済みは維持、未設定は既定モデルになる
3. **Given** override済みの会話、**When** 送信する、**Then** overrideモデルで実行され、メッセージに記録される

## Edge Cases

- **ID名前空間（P0対応）**: 選択肢の供給源 `GET /api/models` は裸ID（例: `kimi-k2.6`）だが、gateway実行契約は `provider/id` 形式必須（`agent/src/models.ts` の `parseModelRef`）。保存・実行値は `opencode-go/<modelId>` 形式に正規化する。UI表示は30モデルのname、valueはqualified IDとする。FR-003の検証はbare抽出でカタログ照合する
- **優先順位**: 会話override ＞ ユーザー設定 `agentModel` ＞ 未設定（gateway既定）
- **override解除**: `null`/空で既定に戻す。UIに「既定に戻す」選択肢を設け、PATCH null許容とする（ユーザー設定側のnullクリア設計と同型）
- **SCOPE外・既存値**: `AGENT_MODEL_SCOPE` 外や既存のprovider付き保存値（例: `anthropic/...`）はP2-008 FR-007を踏襲（GET時の無効値除外・自動書換なし）。実行時400時は通常のエラーUI（仕様外モデルの特別扱いはしない）
- **未設定時の記録**: override・settingsとも未設定の場合、`payload.model` 省略・メッセージ不記録（現行動作）。表示が `conversation.model` に落ち実行モデルと乖離し得る旨を注記する
- **`conversation.model` との関係**: 既存 `model` フィールド（`DEFAULT_MODEL_ID` 書込み）は表示・互換のため残す。Agent実行の選択は新設 `agentModel?` フィールドで行う
- **`agentSubagentModel`**: 対象外。既存のテキスト入力のまま残す
- **選択肢の供給源**: `GET /api/models`（正規30件、P2-019）を再利用する
- **P1-012との境界**: 通常チャットのUI・APIは復活させない。ドロップダウンはAgent実行専用
- **旧会話**: overrideなし＝既定モデルで動作する（履歴・表示に影響なし）

## Requirements

### Functional Requirements

- **FR-001**: 設定画面の既定モデルを正規30モデルのドロップダウンにしなければならない（現行テキスト入力を置換）
- **FR-002**: 既定モデルはユーザー設定の `agentModel` に `opencode-go/<modelId>` 形式で保存しなければならない
- **FR-003**: `agentModel` の保存時にカタログ検証し、未知IDは 400 拒否しなければならない（bare抽出で照合する。ただし他providerのqualified値も拒否する厳格動作とする）
- **FR-004**: ヘッダーに会話単位のモデルドロップダウン（正規30モデル）を追加しなければならない
- **FR-005**: 会話単位の選択は `Conversation.agentModel?`（qualified形式）に永続化しなければならない。`null`/空で解除（既定に戻す）できなければならない
- **FR-006**: チャット実行時のモデル解決は override ＞ `agentModel` ＞ 未設定の優先順位でなければならない
- **FR-007**: 実行モデルを assistant メッセージに記録しなければならない（現行 `payload.model` 記録と同型）
- **FR-008**: 通常チャットのUI・APIを復活させてはならない

### Non-Functional Requirements

- **NFR-001**: `npm test`（frontend・functions）・`tsc` が green でなければならない
- **NFR-002**: 承認フロー・起動中表示（P2-018）に退行があってはならない

## Success Criteria

- **SC-001**: 設定・ヘッダーの両ドロップダウンがテストで固定される
- **SC-002**: 優先順位どおりに実行モデルが選ばれることがテストで固定される
- **SC-003**: 不正モデル保存が拒否されることがテストで固定される

## Out of Scope

- `agentSubagentModel` のドロップダウン化
- 通常チャットの復活
- モデルごとの利用量・課金の表示

## Assumptions

- 正規30モデルすべてがAgent実行に利用可能である
- `GET /api/models` は認証済みユーザーが取得できる
