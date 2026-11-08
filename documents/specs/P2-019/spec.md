# Feature Specification: OpenCode Go最新モデルカタログ追従

**Feature Branch**: `feat/p1-012-p2-018-p2-019-p3-016` | **Spec Folder**: `specs/P2-019` | **Created**: 2026-10-03

**Status**: Draft

**Input**: [P2-019 backlog item](../000_backlog/items/P2-019-opencode-latest-models.md)

> **背景:** 公式Endpoints表（2026-10-03取得）は全30モデル。本ブランチのカタログは35件で、公式にない12件を含み、公式の7件が不足している。live test の件数期待値（27）もカタログ（35）と矛盾しており、本件で30件に正規化する。

## 現状差分（2026-10-03確定）

- **削除12件**（公式表にない）: `grok-4.5`、`glm-5`、`glm-5.1`、`kimi-k2.5`、`mimo-v2-pro`、`mimo-v2-omni`、`minimax-m2.5`、`qwen3.7-max`、`qwen3.6-plus`、`qwen3.5-plus`、`hy3-preview`、`omen-alpha`
- **追加7件**（公式表にある）: `grok-4.7`（responses）、`gpt-6-luna`（responses）、`longcat-2.5-preview-free`（chat-completions）、`deepseek-v4.1-flash`（chat-completions）、`mimo-v2.6-flash`（chat-completions）、`mimo-v2.6-pro`（chat-completions）、`space-bunny-free`（chat-completions）
- **正規30件の内訳**: responses 6 / chat-completions 19 / messages 5

## User Scenarios & Testing

### User Story 1 - モデル一覧が公式表と一致する (Priority: P1)

ユーザーがモデル一覧を取得すると、最新の公式Endpoints表と一致する30モデルが返る。廃止モデルは選べず、新規モデルが選べる。

**Independent Test**: `GET /api/models` が正規30件を重複なく固定順序で返すことを確認できる。

**Acceptance Scenarios**:

1. **Given** モデル一覧を取得できる状態、**When** `GET /api/models` を呼ぶ、**Then** 正規30モデルが固定順序で返る
2. **Given** 削除12件のいずれか、**When** 一覧を確認する、**Then** 含まれていない
3. **Given** 追加7件のいずれか、**When** 一覧を確認する、**Then** 含まれている

### User Story 2 - 全モデルで実API疎通が成功する (Priority: P1)

P2-011 と同型の live test で、30モデルすべての実APIチャットが成功する。

**Independent Test**: `npm run test:live:models` で30/30成功を確認できる。

**Acceptance Scenarios**:

1. **Given** 実APIキーと明示的な live test コマンド、**When** テストを実行する、**Then** 30モデルすべてで空でない本文と正常完了を確認できる
2. **Given** live test 実行中、**When** ログを確認する、**Then** APIキー・リクエスト本文・回答本文・上流エラー本文が出力されていない

### User Story 3 - 利用不可モデル保持の既存会話が安全に扱われる (Priority: P2)

削除12件を保存している既存会話は履歴閲覧可・送信不可のまま（P2-011条件5と同型）。

**Independent Test**: 削除モデルIDを持つ会話で送信が 409 拒否され、履歴が閲覧できることを確認できる。

**Acceptance Scenarios**:

1. **Given** 削除モデルを保持する既存会話、**When** メッセージを送信する、**Then** 409 で拒否され user メッセージは保存されない
2. **Given** 同じ会話、**When** 開く、**Then** 履歴は閲覧できる

## Edge Cases

- **`DEFAULT_MODEL_ID='kimi-k2.6'`**: 公式表に存在するため変更しない
- **タイトル生成モデル（`deepseek-v4-flash`）**: 公式表に存在するため変更しない
- **`kimi-k3` の temperature 除外**: 既存特例を維持する
- **deepseek系 `maxTokens: 16384`**: 既存は `deepseek-v4-*` に適用。新規 `deepseek-v4.1-flash` も同方針を適用する
- **新規モデルの公開メタデータ**: 中立値（`quality: 3`、`speed`/`contextLength: Unknown`、`cost: See OpenCode Go`、`bestFor: General use`）とする（spec 009方針）
- **P1-012 との整合**: P1-012 で通常チャット消費者が削減されても、カタログ自体は本件で30件化する。`GET /api/models` はメッセージ表示名解決に残す。FR-007 の削除モデル409は P2-019適用時点の通常チャット経路で有効だが、P1-012適用後は当該経路ごと消滅し、P1-012 FR-009 の送信不可（`agentMode: false` 会話は一律送信不可・不保存）に吸収される（陳腐化）。実装順序は P2-019→P1-012 を想定する
- **上流の `x-opencode-session` 必須化**: 2026-10-03のlive testで上流が `MissingSessionID`（3プロトコル共通・30/30 http-400）を返した。2026-09-03時点ではHTTPレベルで必須でなかったため、上流契約変更と判断。live harness は本番経路と同様に `sessionId: 'live-test'` を送る（`models.live.test.ts`）。本番チャット経路は `chat.ts` ですでに `sessionId=conversationId` を送っており影響なし
- **P2-016（grok-4.6）**: 本件の live test 30/30に含めて再確認し、2026-10-03のlive testで grok-4.6 を含む30/30成功を確認したため P2-016 は解消とした

## Requirements

### Functional Requirements

- **FR-001**: `MODEL_CATALOG` を正規30件（内訳 responses 6 / chat-completions 19 / messages 5、ID重複なし、固定順序）にしなければならない
- **FR-002**: 追加7件を上記プロトコル分類で追加しなければならない
- **FR-003**: 削除12件をカタログから除去しなければならない
- **FR-004**: 新規 deepseek 項目に既存と同型の `maxTokens` 方針を適用しなければならない
- **FR-005**: 件数・内訳・順序の unit test（`functions/tests/unit/modelCatalog.test.ts`）と `GET /api/models` の integration test（`functions/tests/integration/api.test.ts`：35件固定リスト＋件数期待）を30件化（現行35件期待・live 27件期待の矛盾を解消）しなければならない
- **FR-006**: live test の件数期待値を30に更新し、P2-011同型条件（直列・各1リクエスト・retryなし・512 tokens・120秒timeout）で実行しなければならない
- **FR-007**: 削除モデル保持の既存会話は履歴閲覧可・送信時409拒否（user メッセージ不保存）を維持しなければならない
- **FR-008**: APIキー・リクエスト本文・回答本文・上流エラー本文をログ・Git管理ファイルへ出力してはならない

### Non-Functional Requirements

- **NFR-001**: 通常の `npm test`・CI から実 API を呼ばない方針を維持しなければならない
- **NFR-002**: 3プロトコルの URL・認証・body 形式・SSE 正規化を変更してはならない（カタログ差分のみ）
- **NFR-003**: `README.md` のモデル表と `specs/009-opencode-go-models/spec.md` の正規表を30件化しなければならない

## Success Criteria

- **SC-001**: `GET /api/models` が正規30件を固定順序で返すことがテストで固定される
- **SC-002**: live test で30/30成功する（grok-4.6 含む）
- **SC-003**: 機密・本文のログ出力がないことが確認される
- **SC-004**: `npm test`・ビルドが green である

## Out of Scope

- プロトコル追加・認証方式変更・SSE正規化の変更
- モデルメタデータの精緻化（中立値で統一）
- P1-012 の削除実装（消費者側。本件はカタログ側）

## Assumptions

- [OpenCode Go公式Endpoints表](https://opencode.ai/docs/go/)（2026-10-03取得）が正である
- 上流キャパシティは live test 実行時に利用可能である（不足時は P2-016 と同型で分離する）
