# Feature Specification: AIのエージェント化（pi coding agent RPC連携）

**Feature Branch**: `feat/p3-010-ai-agent` | **Spec Folder**: `specs/P3-010` | **Created**: 2026-09-04

**Status**: Requirements approved (2026-09-04) — plan 作成へ

**Input**: [P3-010 backlog item](../000_backlog/items/P3-010-ai-agent.md)

> **方針（2026-09-04 ユーザー確認済み）:** pi coding agent をバックエンドとしてRPCモードで呼び出す。ツール実行中の進捗を表示する。実行前ユーザー確認はレベルをユーザーが選択できるようにする。モデル対応も pi 経由の方針に寄せる（＝エージェント実行に使うモデルは OpenCode Go カタログではなく pi 側の設定に委ねる）。

> 方針（2026-09-04 ユーザー確認済み）に加え、以下の決定事項を反映済み（残件は Q2 のみ → plan で確定する）。
>
> - **Q1 ホスティング: 別基盤**。Functions とは分離したエージェント実行基盤（Container Apps 等の常駐プロセス想定）に pi を置く。
> - **Q3 確認レベル: 提案通り**。`auto` / `dangerous-only` / `always`、既定 `dangerous-only`。
> - **Q4 ツール: 初期は無効**。将来のファイル作成等を見据え、allowlist 追加のみで有効化できる拡張性を持たせる。実現方式は既定 `--no-tools`（全ツール無効）。`--no-builtin-tools` / `defaultTools: []` は拡張・カスタムツールを残すため不採用。有効化は `--tools` / `pi.setActiveTools()` による allowlist 追加のみで行い、pi-subagents のツールも既定で落とす（`--exclude-tools` 等）。
> - **Q5 モデル: ユーザーが選択可**。pi-subagents をエージェント基盤に導入し、デフォルトのサブエージェントモデルも指定できるようにする。
> - **Q6 永続化: 最小限**。チャットUI前提で、会話履歴（既存 CosmosDB）＋短期の pi セッション対応付けのみ。作業資産はエフェメラル。
> - **Q7 ロールアウト: 全ユーザー**（kill switch 用の機能フラグは残す）。

> **現行構成に関する注記:** Frontend は `frontend/`（React 18 + Vite 5 + Tailwind）。Backend は Azure Functions (`functions/`)。チャット送信は `POST /api/chat` → SSE（`{content, reasoning, done}` / `{error: {code}}`）で、`frontend/src/hooks/useChat.ts` が `AbortController` で停止する。Backend は `functions/src/functions/chat.ts` → `functions/src/services/opencodeGo.ts`（3プロトコル分岐、`x-opencode-session` 付与、SafeErrorCode 契約）経由で OpenCode Go へ中継する。ユーザー設定は `functions/src/services/userSettingsService.ts`（CosmosDB + in-memory フォールバック、現在は `defaultModel` / `displayName` のみ）。

> **pi RPC に関する事実（一次情報: pi 付属 `docs/rpc.md`, `docs/security.md`, `docs/sdk.md`）:**
>
> - 起動は `pi --mode rpc [--provider <name>] [--model <pattern>] [--no-session]`。stdin/stdout 上の JSONL プロトコル。**改行区切りは LF のみ**（Node の `readline` は `U+2028/U+2029` でも分割するためプロトコル非準拠。自前の `\n` 分割リーダーが必要）。
> - コマンド: `prompt`（`streamingBehavior: "steer"` / `"followUp"` 付き追撃可）、`steer`、`follow_up`、`abort`、`new_session` / `switch_session`、`get_state` / `get_messages`、`set_model`、`bash`、`compact` など。`id` による相関が可能。
> - イベント: `agent_start` / `agent_end` / `agent_settled`、`turn_start` / `turn_end`、`message_start` / `message_update`（`text_delta` / `thinking_delta` / `toolcall_start`・`toolcall_delta`・`toolcall_end`）/ `message_end`、`tool_execution_start` / `tool_execution_update`（**累積表示用**の `partialResult`）/ `tool_execution_end`（`toolCallId` 相関）、`queue_update`、`auto_retry_*`、`extension_error`。
> - 承認フローに使える仕組み: **Extension UI プロトコル**（`extension_ui_request` → `extension_ui_response`）。ダイアログ系（`select` / `confirm` / `input` / `editor`）は応答待ちでブロックし、`timeout` 付きなら自動解決する。`notify` / `setStatus` 等は fire-and-forget。**発生源は自作の承認ゲート pi 拡張**（`tool_call` を購読し allowlist 上の分類テーブルで判定→要確認なら `ctx.ui.confirm`/`select`、拒否は `{block: true}`）。pi に確認ダイアログのビルトイン機構は無い。
> - Node.js からは子プロセス RPC の代わりに **SDK（`AgentSession`）を直接埋め込む選択肢**もある（`docs/sdk.md`）。どちらを選ぶかは要決定（§要決定事項 Q1）。
> - **pi にビルトインサンドボックスは無い**（`docs/security.md`）。pi プロセス権限でファイル読み書き・シェル実行が可能。非対話モード（`--mode rpc` 含む）では trust プロンプトが出ない。信頼できない入力を扱う自動化はコンテナ/VM 等の OS 境界での分離が必須と明記されている。

## User Scenarios & Testing

### User Story 1 - エージェントにタスクを委任し進捗が見える (Priority: P1)

ユーザーがチャットで複雑なタスク（調査・まとめ・複数ステップの作業）を依頼すると、Backend が pi（RPC/SDK）に `prompt` を送り、エージェントの思考・ツール実行の進捗がチャット画面にストリーミング表示され、完了後に最終回答がメッセージとして保存される。

**Why this priority**: P3-010 の核心。「質問→回答」1ターンから「委任→遂行」への転換。進捗表示はユーザー回答で必須と確定済み。

**Independent Test**: エージェント対応の会話で複数ツールを使う依頼を送り、完了前に進捗イベント（思考/ツール開始・更新・終了）が SSE で届くこと、完了後に最終回答が保存されることを確認できる。

**Acceptance Scenarios**:

1. **Given** エージェントモードの会話、**When** 複数ステップのタスクを依頼する、**Then** 応答完了前に進捗（何をしているか：思考テキスト・実行中ツール名・途中出力）が画面に表示される
2. **Given** エージェント実行中、**When** ユーザーが停止ボタンを押す、**Then** `abort` が pi に送られ、中断時点までの部分結果が既存の中断保存フロー（P1-003相当）で保存される
3. **Given** エージェント実行中、**When** 上流・pi のいずれかでエラーが起きる、**Then** 既存の SafeErrorCode 契約を拡張した形で安全なコードのみが UI に通知され、APIキーや内部本文は漏れない
4. **Given** 通常チャットとエージェント実行、**When** 両方を使う、**Then** 通常チャット（OpenCode Go 直結）の挙動・SSE 契約は壊れない（後方互換）

### User Story 2 - ツール実行前の確認レベルをユーザーが選べる (Priority: P1)

ユーザーは設定でエージェントのツール実行前確認レベルを選べる（例: `auto` / `dangerous-only` / `always`）。要確認のツール実行が発生すると、チャット画面に承認UI（許可/拒否）が表示され、応答するとエージェントが続行・中止する。

**Why this priority**: ユーザー回答で確定済み。pi にサンドボックスが無い以上、権限管理の主手段になる。

**Independent Test**: 確認レベルごとに要確認ツールを含む依頼を送り、`auto` では承認UIが出ないこと、`always` では毎回出ること、拒否時はエージェントが中止してその旨がメッセージに残ることを確認できる。

**Acceptance Scenarios**:

1. **Given** 確認レベル `always`、**When** ツール実行が必要になる、**Then** 実行前に承認UI（ツール名・引数概要・許可/拒否）が表示され、許可があるまで実行されない
2. **Given** 承認待ち状態、**When** ユーザーが拒否する、**Then** pi 側にキャンセルが伝わり（`extension_ui_response: cancelled` 相当）、拒否された旨が会話に残る
3. **Given** 承認待ち状態、**When** 一定時間応答が無い、**Then** タイムアウトで安全側（拒否扱い）に倒れ、エージェントが宙ぶらりんにならない
4. **Given** 設定画面、**When** 確認レベルを変更する、**Then** 既存のユーザー設定（`defaultModel` / `displayName` と同列）に保存され、次回実行から適用される

### User Story 3 - 会話とエージェントセッションが対応する (Priority: P2)

DoyonChat の会話 ID と pi のセッションが対応し、同じ会話では文脈を引き継いで依頼できる。新規会話では新しいセッションが始まる。

**Why this priority**: 文脈引継ぎが無いと毎回ゼロからの依頼になり、エージェントの価値が半減する。`x-opencode-session` と同様の「会話ごとの安定ID」思想の流用。

**Independent Test**: 同一会話で2回依頼し、2回目が1回目の結果を踏まえた応答になること。別会話では引き継がないことを確認できる。

**Acceptance Scenarios**:

1. **Given** 既存会話、**When** エージェントに依頼する、**Then** その会話に紐づく pi セッション（`switch_session` 相当の対応付け）で実行される
2. **Given** 新規会話の初回依頼、**When** 送信する、**Then** 新しい pi セッションで実行され、空セッションが残り続けない
3. **Given** 会話を削除した状態、**When** 対応する pi セッションがある、**Then** セッション資産（ファイル）が残り続けない（Q6 確定済み：短期保持＋会話削除時破棄）
4. **Given** 基盤の再起動・再デプロイ後、**When** 既存会話で依頼する、**Then** 旧セッション引継ぎは不可として新規セッション扱いになる（replica=1＋sticky 運用でも再起動分は許容する）

### User Story 4 - エージェント失敗時は安全にフォールバックする (Priority: P2)

pi プロセス異常・タイムアウト・長時間実行の打ち切り時は、通常チャットへのフォールバックまたは明確なエラー表示になり、課金・リソースの無制限消費が起きない。

**Why this priority**: Functions の実行時間上限と従量課金の затраты の観点で必須の安全弁。

**Independent Test**: pi 応答を意図的に遅延/異常終了させ、タイムアウト後にエラー通知と会話の整合性（中途半端なゴミメッセージが残らない）が保たれることを確認できる。

**Acceptance Scenarios**:

1. **Given** エージェント実行中、**When** 規定時間を超える、**Then** 打ち切り＋ユーザー通知が行われ、バックエンドのリソース（pi プロセス）が回収される
2. **Given** pi プロセスが異常終了、**When** 実行中だった、**Then** 会話は通常チャット継続可能な状態に戻り、再試行できる
3. **Given** エージェント機能が無効/未設定の環境、**When** 開く、**Then** エージェントUIは出ず、通常チャットのみ動作する（段階ロールアウト可能）

## 提案する SSE 拡張（後方互換・叩き台）

既存イベント `{content, reasoning, done}` / `{error: {code}}` は変えない。エージェント進捗は任意フィールドの追加で表現する（詳細は plan で確定）。

- `agent` 系: `{agentEvent: 'tool_start'|'tool_update'|'tool_end'|'thinking', toolName?, summary?}`（`tool_execution_*` と `thinking_delta` の中継用）
- 承認要求: `{approvalRequest: {id, toolName, argsSummary}}`（`extension_ui_request: confirm/select` の中継用）。応答は `POST /api/agent/approve {approvalId, approved}` の新設想定
- 完了: 既存 `done: true` を流用し、最終回答は通常メッセージとして保存

## 提案する設定拡張（叩き台）

`UserSettings` に `agentApprovalLevel?: 'auto' | 'dangerous-only' | 'always'`（既定 `dangerous-only`・確定済み）、`agentModel?: string`、`agentSubagentModel?: string`（未設定時は pi 側既定）を追加。

## Edge Cases

- **長時間実行と Functions 上限**: Agent ループは数分〜十数分になり得る。Functions のタイムアウト・SSE 接続維持限界と衝突するため、ホスティング方式の決定（Q1）が全ての前提
- **マルチユーザー分離**: pi プロセス/セッションをユーザー間で共有しない。認証済み userId に紐づけた分離が必須（現行の会話所有者チェックと同等以上）
- **プロンプトインジェクション**: pi 公式に「リポジトリ内容・ビルド出力からの注入は想定内の局所エージェントリスクで完全防止は不可」とある。エージェントに読ませる範囲（Web/ファイル）の制限と、書き込み系ツールの既定無効化で緩和する
- **コスト**: エージェントは1依頼で多LLMコールを消費する。上限（ターン数・時間・トークン）の既定値と超過時動作を plan で定義する
- **タイトル自動生成**: エージェント会話のタイトル生成は既存 `generateTitle` を流用し、エージェント実行とは分離する（短命・低コスト維持）
- **画像入力**: エージェント依頼時の画像は pi `prompt.images`（`ImageContent`）で渡せるが、MVP に含めるかは要決定
- **既存モデルカタログ**: エージェント実行モデルは pi 側設定に委ね、`/api/models` カタログ（OpenCode Go 27件）とは独立させる（Q4 方針通り）

## 要決定事項（残件）

- [ ] **Q2 RPC クライアント詳細**: JSONL リーダー（LF のみ分割）の実装、再接続・ゾンビプロセス回収、同時実行数上限 → **plan で確定する**

※ Q1/Q3/Q4/Q5/Q6/Q7 は 2026-09-04 に確定済み（本 spec 冒頭の決定事項を参照）。

## 受け入れ条件（backlog との対応）

1. pi がツールを必要と判断した場合、ツール結果を回答に反映できる → Story 1（初期ツールは既定無効＋allowlist 拡張。Q4 確定済み）
2. ツール実行中はユーザーに進捗が表示される → Story 1（`tool_execution_*` 中継）
3. 要確認の場合は明示的な承認フローがある → Story 2（Extension UI プロトコル＋承認UI）
4. 失敗時は適切に処理して通知する → Story 4（SafeErrorCode 拡張＋フォールバック）

## 関連ファイル（想定・plan で確定）

- `agent/`（新規：エージェント実行基盤。pi RPC ゲートウェイ＋ツール allowlist 設定＋pi-subagents 同梱）
- `infra/modules/agentPool.bicep`（新規：Container Apps 想定。既存 modules と同流儀）
- `functions/src/services/agentPi.ts`（新規：別基盤へのプロキシ、SSE 変換、承認相関）
- `functions/src/functions/chat.ts`（エージェント分岐・SSE 拡張イベント追加）
- `agent/extensions/approvalGate.ts`（新規：承認ゲート pi 拡張。`tool_call` 購読→分類テーブル判定→`ctx.ui.confirm`/`select`、拒否は `{block: true}`。確認レベル判定の中核）
- `functions/src/functions/agent.ts`（新規想定：承認応答 `POST /api/agent/approve`、実行状態取得 `GET /api/agent/runs/:id`）
- `functions/src/services/userSettingsService.ts`（`agentApprovalLevel` 追加）
- `functions/src/types/index.ts`（設定・SSE 型追加）
- `frontend/src/hooks/useChat.ts`（進捗・承認イベントの購読）
- `frontend/src/components/Chat/*`（進捗表示・承認UI。`ToolCallConfirmation.tsx` 新規想定）
- `frontend/src/services/chatApi.ts`（承認 API 呼び出し追加）

## 検証計画（叩き台）

- mock モード（APIキー無し相当）のエージェント版：pi 無しで進捗・承認フローの UI 結合を自動テスト
- 結合テスト：pi の RPC イベント列 → SSE 変換の単体テスト（`tool_execution_update` 累積表示、`extension_ui_request` 相関、`abort` 伝播）
- 手動 live test：要確認ツール混じりの依頼で承認→続行→完了、拒否→中止、停止→部分保存、タイムアウト→回収
- セキュリティ：ユーザー間セッション混在が無いこと、承認なしで書き込み系が実行されないこと（Q3/Q4 の定義に基づく）
