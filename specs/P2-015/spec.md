# Feature Specification: x-opencode-session ヘッダ付与・遅延作成・モデル1件追加

**Feature Branch**: `feat/p2-015-opencode-session-header` | **Spec Folder**: `specs/P2-015` | **Created**: 2026-09-03

**Status**: Implemented, pending deployment（live test 26/27、`grok-4.6` は上流回復待ち → P2-016）

**Input**: [P2-015 backlog item](../000_backlog/items/P2-015-opencode-session-header.md)

> **背景:** OpenCode Go からの通知によれば、一部のリクエストに `x-opencode-session` ヘッダがなく、09/06 以降はヘッダなしリクエストがエラーになる可能性がある。不足ヘッダの useragent は `Node fetch` であり、Functions backend の素の `fetch`（`functions/src/services/opencodeGo.ts`）に一致する。現状 `createRequest()` の3プロトコル分岐はいずれも当該ヘッダを送っていない。

## User Scenarios & Testing

### User Story 1 - チャット送信で会話ごとの安定IDを送る (Priority: P1)

ユーザーがチャットを送信すると、上流 OpenCode Go へのリクエストにその会話の安定IDが `x-opencode-session` として付与される。同じ会話の複数メッセージでは同じ値が送られる。

**Why this priority**: 通知対応の核心。ヘッダなしでは 09/06 以降チャット自体が失敗し得る。

**Independent Test**: 会話 ID を指定して `POST /api/chat` を送り、上流 `fetch` のヘッダに `x-opencode-session: <conversationId>` が含まれることを mock test で確認できる。

**Acceptance Scenarios**:

1. **Given** 既存の会話 ID、**When** チャットメッセージを送信する、**Then** 上流リクエスト（`responses` / `chat/completions` / `messages` のいずれも）に `x-opencode-session: <conversationId>` が付与される
2. **Given** 同じ会話、**When** 複数回メッセージを送信する、**Then** ヘッダ値は毎回同じ会話 ID である
3. **Given** 別の会話、**When** メッセージを送信する、**Then** ヘッダ値はその会話の ID であり、他の会話の ID とは異なる

### User Story 2 - タイトル自動生成でも同一会話IDを送る (Priority: P2)

タイトル自動生成（`POST /api/conversations/{id}/title/auto`）の上流リクエストにも、対象会話の ID が `x-opencode-session` として付与される。

**Why this priority**: タイトル生成も独立した上流 `fetch`（`generateTitle` → `streamChat`）であり、同じ通知の対象になるため。

**Independent Test**: 会話 ID を指定してタイトル自動生成 API を呼び、上流 `fetch` のヘッダに同一会話 ID が含まれることを mock test で確認できる。

**Acceptance Scenarios**:

1. **Given** 既存の会話 ID と本文、**When** タイトル自動生成を呼ぶ、**Then** 上流リクエストに `x-opencode-session: <conversationId>` が付与される

### User Story 3 - 新規チャットは初回送信時に作成される (Priority: P2)

新規チャットボタン押下では DB レコードを作らず、初回メッセージ送信時に初めて会話を作成する。送信せずに離れた場合は空会話が残らない。

**Why this priority**: 空のまま残るゴミ会話が一覧を汚す問題の解消。P2-015 と同一ブランチで対応し、会話 ID 払い出し（=`x-opencode-session` の安定ID源）のタイミングも同時に正す。

**Independent Test**: ボタン押下後に `POST /conversations` が呼ばれていないこと、一覧に仮行が増えていないこと、初回送信で会話が作成され送信前選択モデルで送信されることを確認できる。

**Acceptance Scenarios**:

1. **Given** 会話一覧表示中、**When** 新規チャットボタンを押す、**Then** `POST /conversations` は呼ばれず、一覧に仮行は追加されず、チャット欄は空＋入力可能な状態になる
2. **Given** 未選択（ドラフト）状態、**When** メッセージを送信する、**Then** 初めて会話が作成され一覧先頭に現れ、その会話でメッセージが送信される
3. **Given** 未選択状態、**When** 送信前にモデルを変更する、**Then** 選択はローカルに保持され、作成される会話のモデルになる
4. **Given** 未選択状態で未送信、**When** リロードまたは他の既存会話を選択する、**Then** ドラフトは破棄され、空会話は残らない
5. **Given** 既存会話を選択中の状態、**When** メッセージを送信する、**Then** 従来どおりその会話に送信され、新規作成は行われない

### User Story 4 - muse-spark-1.3-contributor を追加する (Priority: P2)

公式Endpoints表（27件）に追従し、`muse-spark-1.3-contributor` をカタログへ追加する。Endpoint は `/v1/responses`。

**Why this priority**: 公式表との差分は本件のみ。放置すると利用可能なモデルを選べない。

**Independent Test**: `GET /api/models` が27件を返し、1.3 選択時の送信が `POST /v1/responses` へルーティングされることを mock test で確認できる。live test で27/27成功を確認する。

**Acceptance Scenarios**:

1. **Given** モデル一覧を取得できる状態、**When** `GET /api/models` を呼ぶ、**Then** 正規27モデルが重複なく安定した順序で返され、`muse-spark-1.3-contributor` を含む
2. **Given** 1.3 を選択した状態、**When** メッセージを送信する、**Then** `POST /v1/responses` のストリームが利用される
3. **Given** 実APIキーと明示的な live test コマンド、**When** テストを実行する、**Then** 27モデルすべてで空でない本文と正常完了を確認できる

## Edge Cases

- **会話に紐付かない `healthCheck()` の ping**: 会話 ID が存在しないためヘッダを付与しない（上流の最適化対象外の疎通確認と位置づける）
- **ヘッダ値の形式**: `conversation.id`（`crypto.randomUUID()` 払い出しの UUID）をそのまま使う。変換・ハッシュ化しない
- **認証・認可**: 既存の `authenticateRequest` + 会話所有者チェックを経た ID のみを使う。新規の ID 受け入れ経路は作らない
- **ログ**: ヘッダ値（会話 ID）は既存のログ方針に従い、API キー等の機密情報と同様に扱い、上流エラー本文とともに出力しない
- **初回送信の上流失敗時**: 会話レコードと user メッセージは作成済みのため残る（既存の再試行フローで送信再試行できる）。「空ゴミ」とは異なり意味あるタイトル・内容を持つため許容する
- **ドラフト中のモデル一覧未取得・取得失敗**: 既存の `modelDisabledReason` に従い送信停止する（新規ガードは作らない）
- **タイトル自動生成**: 既存の遅延パスが `autoTitle(conv.id, text)` を呼ぶため、そのまま流用する
- **1.3 の地域制限・学習利用**: 公式 Privacy 表で training: Yes・地域制限ありのため、説明文は既存 1.2 と同文（地域制限と学習利用の注意）とする
- **既存会話への影響**: 新規追加のみのため、利用不可判定・保存済みモデルの扱いは変わらない
- **既定モデル**: `kimi-k2.6` のまま変更しない

## Requirements

### Functional Requirements

- **FR-001**: `functions/src/services/opencodeGo.ts` の `createRequest()` は3プロトコル（`responses` / `chat-completions` / `messages`）すべてで `x-opencode-session` ヘッダを送らなければならない
- **FR-002**: ヘッダ値は呼び出し元から渡された会話 ID でなければならず、`opencodeGo.ts` 内で新規 ID を生成してはならない
- **FR-003**: `OpenCodeGoOptions` に会話 ID を受け渡す手段（例: `sessionId?: string`）を追加しなければならない
- **FR-004**: `functions/src/functions/chat.ts` は `chatHandler` で取得済みの `conversationId` を `streamChat()` へ渡さなければならない
- **FR-005**: `generateTitle()` は会話 ID を受け取れるようにし、`functions/src/functions/conversations.ts` の `titleAutoHandler` は `conversation.id` を渡さなければならない
- **FR-006**: `healthCheck()` の `ping` には `x-opencode-session` を付与しなくてよい
- **FR-007**: 新規チャットボタン押下時に `POST /conversations` を呼んではならない。一覧への仮行追加もしてはならない。選択解除（＋ドラフトモデル初期化）のみとする
- **FR-008**: 未選択状態のモデル表示・変更はローカル state（例: `draftModel`、初期値は設定のデフォルトモデル）で保持し、リロードで破棄されてよい
- **FR-009**: 未選択状態からの初回送信は、既存の遅延作成パスを使い、`draftModel` を会話モデルとして作成しなければならない
- **FR-010**: 既存会話選択中の送信フロー（作成なし・`NEW_CHAT_TITLE` 時の自動タイトル）を変更してはならない
- **FR-011**: `muse-spark-1.3-contributor` を protocol `responses` でカタログへ追加しなければならない。公開メタデータは中立値（`quality: 3`、`speed`/`contextLength: Unknown`、`cost: See OpenCode Go`、`bestFor: General use`）とし、`description` は 1.2 と同文（地域制限と学習利用の注意）とする
- **FR-012**: 正規モデルは27件（内訳 responses 4 / chat-completions 15 / messages 8、ID重複なし、固定順序）でなければならない
- **FR-013**: live test は27モデルを直列・各1リクエスト・自動 retry なしで実行し、成功条件（空でない本文＋正常完了）は変えてはならない

### Non-Functional Requirements

- **NFR-001**: 既存の3プロトコルの URL・認証ヘッダ・body 形式を変更してはならない（追加ヘッダのみ）
- **NFR-002**: 通常の `npm test`・CI で実 API を呼んではならない（既存方針維持。ヘッダ付与は mock/fixture test で固定する）

## Success Criteria

- **SC-001**: 3プロトコルすべての上流リクエストに `x-opencode-session` が付与されることがテストで固定される
- **SC-002**: チャット送信とタイトル自動生成で、ヘッダ値が対象会話の ID と一致する
- **SC-003**: `npm run build` / `npm test`（frontend と functions 両方）が成功し、今回差分に新規 lint 警告がない
- **SC-004**: ボタン押下のみでは DB レコードが作られず、一覧も変わらないことがテストで固定される
- **SC-005**: 初回送信で `draftModel` の会話が作成され、メッセージ送信と自動タイトル付けが行われる
- **SC-006**: 正規モデルIDが27件で一意、内訳が responses 4 / chat-completions 15 / messages 8 であり、live test で27/27成功する

## Out of Scope

- モデルカタログ・プロトコル選択・SSE 正規化の変更（P2-011 の範囲）
- `healthCheck()` へのヘッダ付与
- Frontend → backend (`/api/chat`) のリクエスト形式変更（backend が所有する会話 ID を使うため不要）
- `muse-spark-1.3-contributor` 以外のカタログ変更・既存モデルのメタデータ見直し

## Assumptions

- メールの `stable-id-per-conversation` には DoyonChat の `conversation.id` が適合する（会話作成時に1度払い出され、不変）
- `x-opencode-session` は任意の安定文字列を受け付け、09/06 以降のエラー化条件は「ヘッダの有無」である（値の形式検証の詳細は不明のため、UUID をそのまま送る）
