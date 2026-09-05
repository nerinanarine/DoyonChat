# Implementation Plan: AIのエージェント化（pi coding agent RPC連携）

**Branch**: `feat/p3-010-ai-agent` | **Date**: 2026-09-04 | **Spec**: [spec.md](./spec.md) | **Backlog**: [P3-010](../../specs/000_backlog/items/P3-010-ai-agent.md)

**Input**: [Feature specification](./spec.md) / Backlog P3-010 / 2026-09-04 ユーザー決定（別基盤・確認レベル既定・初期ツール無効＋拡張性・モデル選択＋pi-subagents・最小永続化・全ユーザー）

## Summary

Azure Functions とは分離したエージェント実行基盤（Container Apps 想定）に pi coding agent を常駐させ、Functions は認証・プロキシ・SSE 中継に徹する。pi は `--mode rpc`（JSONL over stdin/stdout）で駆動し、`tool_execution_*` 進捗と Extension UI 承認要求（自作の承認ゲート pi 拡張が発火する `confirm`/`select`）を既存 SSE 契約の後方互換拡張でフロントへ流す。ツールは初期既定で全無効（`--no-tools`。`--no-builtin-tools` / `defaultTools: []` は拡張ツールを残すため不採用）とし、`--tools` / `pi.setActiveTools()` による allowlist 追加のみで将来拡張できるレジストリにする。pi-subagents を基盤イメージに同梱し、メインモデルとデフォルトのサブエージェントモデルはユーザー選択可（ユーザー設定に保存）とする。永続化は最小限（会話履歴＝既存 CosmosDB、pi セッション対応付け＝短期、作業資産＝エフェメラル）。全ユーザー公開だが kill switch（`AGENT_ENABLED`）を残す。

## Technical Context

**Runtime**: Functions 側は現行 Node.js のまま変更なし。新規 `agent/` は Node.js 20 コンテナ。

**Agent 基盤**: Azure Container Apps（新規 `infra/modules/agentPool.bicep`）に常駐する `agent/gateway`（Node）。子プロセスとして `pi --mode rpc` をユーザー実行単位に起動し、HTTP(S)+SSE で Functions と対話する。Functions→gateway 間は Managed Identity（または Key Vault 保持の共有シークレット）で認証する。

**pi 実行形**: `pi --mode rpc --no-session --no-tools --models <scope>`。RPC クライアントは自前の LF のみ分割 JSONL リーダーを持つ（Node `readline` はプロトコル非準拠のため使用禁止）。`pi-subagents`（npm）は `packages` 設定で基盤イメージに同梱するが、その提供ツールも既定で落とす（`--exclude-tools` 等）。承認ゲート用 pi 拡張 `agent/extensions/approvalGate.ts` を同梱し、`tool_call` 購読→分類判定→`ctx.ui.confirm`/`select`（拒否は `{block: true}`）を担わせる。

**モデル選択**: pi の `--models` / `enabledModels` スコープで許可モデルを絞り、ユーザー設定 `agentModel` / `agentSubagentModel`（未設定時は pi 側既定）で選択する。

**Frontend/Backend 契約**: 既存 SSE（`{content, reasoning, done}` / `{error: {code}}`）に任意フィールド追加のみ。承認応答は `POST /api/agent/approve` 新設。

**Constraints**:

- Functions 側に長時間プロセス・子プロセスを持たない（時間制限・スケール・課金の分離）
- 既存の通常チャット（OpenCode Go 直結）の挙動・SSE 契約を壊さない
- ユーザー間で pi プロセス/セッションを共有しない（userId 紐づけ分離）
- APIキー・上流本文をログ・SSE・UIに出さない（P2-003 契約を継承）
- 書き込み系ツールは設定 allowlist に載るまで実行不可（既定無効）

## Design Decisions

### D1. 別基盤（Container Apps）＋ Functions はプロキシに徹する

Functions 内への SDK 埋め込み・子プロセス起動は、実行時間上限・コールドスタート・ゾンビプロセス回収・スケールの観点で不採用。エージェント実行は常駐型の別基盤に置き、Functions は Entra 認証→gateway プロキシ→SSE 中継のみ担う。課金・スケールも分離でき、kill switch（gateway 停止/フラグ）で即時無効化できる。

### D2. gateway が pi プロセスの所有者になる

pi プロセスの起動・`prompt`/`abort`・JSONL 読取・再接続・ゾンビ回収・同時実行数上限は gateway に集約する（spec Q2 の確定）。Functions はステートレスな中継に留め、承認相関 ID と SSE 変換のみ持つ。1ユーザー実行＝1 pi プロセスを原則とし、上限超過は 429 系の安全コードで返す。

追加で gateway が持つ責務：

- **実行状態の保持と再購読**: 実行単位に状態（進捗・承認待ち・最終結果）を保持し、`GET /api/agent/runs/:id`（Functions 経由）で取得・再購読できるようにする。SSE 切断後にクライアントが復帰しても最終回答を取りこぼさない。
- **停止の伝播**: フロント `stop()` による SSE 切断を gateway が検知したら pi に `abort` を送り、返ってきた部分テキストを既存の中断保存フロー（P1-003 相当：Functions `finalizeAssistant`）へ流す。
- **アイドル対策**: 承認待ち等の無音期間は gateway→Functions 方向に heartbeat（SSE コメント `: ping` または進捗イベントの定期送出）を行い、プロキシのアイドルタイムアウト切断を防ぐ。切断時は実行状態取得エンドポイントが最終回答の回収経路になる。

### D3. ツールは既定で全無効＋allowlist レジストリで拡張性を確保する

pi 起動は `--no-tools`（全ツール無効）を既定とする。`--no-builtin-tools` / `defaultTools: []` は拡張・カスタムツールを残すため不採用（レビュー指摘反映）。ツール有効化は `agent/tools.allowlist.json`（名称案）の allowlist 追加のみで行え、`--tools` による厳格 allowlist と `pi.setActiveTools()` の併用は gateway 起動時設定に一元化する（`setActiveTools` の additive 制約に注意）。将来のファイル作成等は allowlist＋承認レベル定義の追加で対応し、コード改修を最小化する。

### D4. モデル選択はユーザー設定＋pi スコープの二層にする

許可範囲は基盤側の `--models` / `enabledModels`（管理者・環境変数で制御）、選択はユーザー設定 `agentModel`（メイン）/ `agentSubagentModel`（pi-subagents のデフォルト。未設定時は pi 既定）。カタログ `/api/models`（OpenCode Go 27件）とは独立させ、エージェント用モデル一覧は `get_available_models` 相当を gateway 経由で取得する。

### D5. 承認は自作ゲート拡張＋Extension UI プロトコルの中継＋タイムアウト安全側で実装する

pi に確認ダイアログのビルトイン機構は無いため、承認ゲート用 pi 拡張 `agent/extensions/approvalGate.ts` を成果物として実装する：`tool_call` を購読し allowlist 上の分類テーブルで判定→要確認なら `ctx.ui.confirm`/`select`（拒否は `{block: true}`）。gateway は `extension_ui_request: confirm/select` → SSE `{approvalRequest: {id, toolName, argsSummary}}` → フロント承認UI → `POST /api/agent/approve {approvalId, approved}` → `extension_ui_response` と中継する。無応答タイムアウトは拒否扱いで解決し、エージェントの宙ぶらりんを防ぐ。確認レベル既定 `dangerous-only`、`dangerous` 判定は allowlist 上のツール分類テーブルで定義する。

### D6. 永続化は最小限（履歴は既存、セッションは短期、作業資産はエフェメラル）

会話履歴の正本は既存 CosmosDB のみ。pi セッションファイルは `conversationId` 紐づけで短期保持し、会話削除時は破棄する。作業ディレクトリは実行単位のエフェメラル領域（コンテナ再起動で消去）とし、チャットUIに必要な資産は最終回答テキストのみをメッセージ保存する。スケール・再起動対策として agent 基盤は replica=1＋会話→インスタンス sticky を原則とし、それでも再起動後は旧セッション引継ぎ不可（新規セッション扱い）とする例外を spec Story 3 に明記する。

### D7. 全ユーザー公開＋kill switch

Q7 決定通り全ユーザー対象。ただし `AGENT_ENABLED=false`（Functions）/ gateway レプリカ 0 で即時無効化できる kill switch を残し、エージェント UI は無効時は非表示・通常チャットのみ動作（spec Story 4-3）とする。

## Phase 0 - 基盤 PoC（疎通）

- [x] `agent/gateway` 雛形（Node）：ヘルスチェック、pi 子プロセス起動、`prompt`→`agent_settled` までの最小中継
- [x] JSONL リーダー（LF のみ分割）、プロセス異常終了・タイムアウト時の回収
- [x] ローカル docker での動作確認（build＋`/health` 疎通済み。Managed Identity / 共有シークレット配線は Phase 3 の bicep 化で実施）
- [x] 検証：サンプル依頼でテキスト回答が返ること、pi 停止時に安全コードで返すこと
- [x] PoCレビュー（§Review Gates の前倒し適用：JSONL リーダー・プロセス回収を reviewer で確認してから Phase 1 へ。verdict GO、指摘 F1〜F9 対応済み→`memo-phase0.md`）

## Phase 1 - 進捗中継＋承認フロー＋設定

- [x] `message_update`（text/thinking→`{content}`/`{reasoning}`正規化）・`tool_execution_*`（素通し）の SSE 変換（spec §提案する SSE 拡張）と heartbeat（無音期間の `: ping` 送出）
- [x] 承認ゲート pi 拡張 `agent/src/extensions/approvalGate.ts`（`tool_call` 購読・分類判定・`ctx.ui.confirm`、拒否 `{block: true}`、confirm 専用）と gateway 側の承認要求中継・`POST /approve`（相関 ID 名前空間化・タイムアウト拒否扱い）
- [x] Functions 側プロキシ `POST /api/agent/approve`（Entra 認証→gateway 中継。kill switch・バリデーション・安全エラー mapping 付き）
- [x] 実行状態取得 `GET /runs/:id`（gateway。切断後の再購読・最終回答回収用）
- [x] Functions 側プロキシ `GET /api/agent/runs/:id`（Entra 認証→gateway 中継）
- [x] 停止伝播（gateway）：SSE 切断検知→pi `abort`→部分テキストをレジストリへ `interrupted` 保存
- [ ] 停止伝播（Functions 接続）：中断部分テキストを既存中断保存フロー（P1-003 相当）へ流す
- [x] フロント：進捗表示（`AgentProgress` 新規）・承認UI（`ToolCallConfirmation` 新規）、`useChat`/`chatApi`/`useSettings`/`SettingsMenu` 拡張
- [x] 設定：`agentApprovalLevel` / `agentModel` / `agentSubagentModel` の保存・sanitize（P2-008 流儀。不正レベル除外・空文字クリア・PATCH バリデーション付き）
- [x] 検証：mock SSE による UI 結合テスト（承認→続行・拒否・expired 閉鎖）、gateway 側の承認→続行・拒否→中止・タイムアウト→拒否・レベル別（auto/dangerous-only/always）発火テスト。vitest 137件・gateway jest 34件・functions jest 188件 green
- [x] レビューゲート RG-1（§Review Gates。verdict: 条件付きGO。must-fix F1対応済み→`memo-phase1.md`）

## Phase 2 - セッション対応＋ツールレジストリ＋pi-subagents

- [x] 会話 ID↔pi セッション対応付け（`switch_session`・短期保持、replica=1＋sticky。存在しないパスへの切替成功を実機確認済み。68件 green）
- [x] Functions エージェント経路：`/chat` エージェント分岐（gateway `POST /prompt` へ承認レベル付きで中継、危険ツール表は allowlist 既定に委譲＝単一真実源。SSE 契約は既存流用）＋中断部分テキストの P1-003 保存フロー接続＋ユーザー設定 `agentApprovalLevel` の gateway 反映（RG-1 F1/F9 残部・RG-2 F5 確定）。run 所有者検証（RG-2 F1 must-fix 対応：run→会話→所有者照合）・削除時破棄接続（RG-2 F2）も実装済み
- [x] ツール allowlist レジストリ（`agent/tools.allowlist.json`、既定空＝全無効）と `dangerous` 分類テーブル（`--tools` 付加・`APPROVAL_DANGEROUS_TOOLS` 既定・壊JSONは fail-closed）。pi 実ツール名との一致を確認（pi 付属 settings.md のビルトイン `read, bash, powershell, edit, write, grep, find, ls` とゲート既定が整合。73件 green）
- [x] Phase 2 事前確認（delegate 実機調査で確定）：① `agentSubagentModel` の渡し方は pi 起動前の settings.json `subagents.defaultModel` 書込のみ（env・フックなし）。multi-user 分離は `PI_CODING_AGENT_DIR` による per-user 設定ディレクトリ化。未設定時は親セッションモデル継承。② `get_available_models` は `--models` スコープを**反映しない**（実測33件完全一致）。gateway 側で minimatch フィルタ＋`set_model` 中継時検証が必須（`set_model` 自体はスコープ非チェック、`--model` は scope 優先のため `agentModel` も検証対象）
- [x] `pi-subagents` 同梱の下地（`PI_CODING_AGENT_DIR` per-user 設定ディレクトリ＋settings.json `subagents.defaultModel`/`packages` 書込。イメージへの npm 同梱は Phase 3 bicep/デプロイ時に確定）
- [x] エージェント用モデル一覧：gateway が `get_available_models`（全カタログ）を取得し `--models`/`enabledModels` パターンで minimatch フィルタ。`set_model` 中継時もスコープ内検証を実施（`GET /models`＋`/prompt model` 付き、59件 green）
- [x] 上限（ターン数・時間・トークン）の既定値の数値確定と超過時打ち切り＋回収。承認待ち時間の扱い（promptTimeout 算入の是非）・RunRecord.events 件数上限も合わせて設計（RG-1 F2/F8）。方針確定：承認待ちは実行予算外（タイマー停止・2000件上限）。ターン数・トークン上限は将来の allowlist 有効化時（Phase 3 運用）に再評価
- [x] 会話モデル（`conversation.model`）とエージェントモデル（`agentModel`）の優先関係を定義する（リクエスト model ＞ `AGENT_DEFAULT_MODEL` ＞ 未指定。`conversation.model` は表示・妥当性チェックのみ→`memo-phase2.md`）
- [x] 検証：同一会話で文脈引継ぎ・別会話で非引継ぎ、allowlist 外ツールが実行されないこと、上限超過時の回収、confirm 待ち中の abort 受理可否の実機確認（RG-1 F11)。live test 完了→`memo-phase2.md`（別会話非引継ぎ・allowlist 外実行不可は自動テスト済み）
- [x] レビューゲート RG-2（§Review Gates。verdict: 条件付きGO（Phase 3 着手可）。F1 must-fix は RG-3 までの条件→Phase 3・memo 残件に明記→`memo-phase2.md`）

## Phase 3 - デプロイ・運用・公開

**方針確定（2026-09-05）**: Dev環境に先行デプロイ（stagingは未運用のため使わない）→疎通・E2E→prod展開。新規ACA環境（min=max=1・方式A固定、既存と同居・同リージョン）。Functions→gateway間認証は Managed Identity。F1はFunctions側照合。公開手順は kill switch OFFでデプロイ→検証→有効化→全ユーザー。Q6本番初期値（scope空/maxRuns4/default未設定/承認120s・実行180s）は提案のまま、確定待ち。

- [x] `infra/modules/agentPool.bicep` 化と環境変数・シークレット（Key Vault）配線。gateway 側の認証検証実装を含める（RG-1 F5。露出前必須。方式は Managed Identity・Entra JWT 検証。90件 green）。サーバー鍵は env（`OPENCODE_API_KEY`）経由で供給し、per-user dir へ認証コピーしない（live test 副次発見3）
- [ ] App Insights への実行メトリクス（実行数・所要時間・トークン・承認率・打ち切り率）
- [x] Dev デプロイ・疎通確認（2026-09-05 実施済み：agentpool Succeeded、gateway /health ok・revision Healthy、未認証 401 確認、kill switch OFF・AGENT_ENABLED=false 確認。デプロイ中の修正：AcrPull GUID訂正・CPU/メモリ組合せ・node22）。残りは有効化・E2E・公開判断
- [ ] 初回起動 latency 対策：ツール有効化時の per-user npm 展開を初回のみにし、イメージ事前展開・進捗表示を検討（live test 副次発見2）。pi-subagents 由来サブプロセスへのゲート適用をツール有効化前に実機検証（RG-2 F8）
- [ ] 全ユーザー公開、backlog P3-010 の実装メモ・ステータス更新
- [x] レビューゲート RG-3（§Review Gates・公開前最終関門）。RG-3 must-fix 対応済み：F-1 MIトークン一本化（`gatewayToken.ts`・静的キー削除）・F-2 CI/スクリプトのfail-closed＋bicep必須化・F-3 AUTH同時必須ガード・F-4 dependsOn。残りは実デプロイ・疎通・E2E（ユーザー手順）

## Review Gates（必須プロセス）

本機能では各フェーズの成果物を **サブエージェント（reviewer・読み取り専用）で必ずレビュー**する。AGENTS.md の「Leverage Available Agents」に従い、親エージェントが最終決定者として判定を下す。

- **RG-0（済）**: 本 spec/plan 自体を reviewer でレビューし、verdict BLOCK（must-fix 2件）→ 本 plan へ反映済み
- **RG-1（Phase 1 完了時）**: 対象＝承認ゲート拡張・SSE 変換・承認 API・フロント承認UI・設定拡張。観点＝承認なし実行の抜け穴、SSE 後方互換、タイムアウト安全側、既存中断保存フローとの整合
- **RG-2（Phase 2 完了時）**: 対象＝セッション対応・allowlist・モデル配線・上限制御。観点＝ユーザー間分離、allowlist 迂回（pi-subagents 経由含む）、再起動時挙動、上限超過時の回収
- **RG-3（公開前）**: 対象＝bicep・シークレット配線・メトリクス・kill switch。観点＝権限最小化、シークレット漏洩経路、無効時の完全停止
- **運用**: verdict BLOCK の must-fix は次フェーズ着手前に修正する。should-consider/nit は親エージェントが取捨選択し、採用しなかった理由を実装メモに残す。レビュー結果と対応は `specs/P3-010/` の実装メモに記録する

## Test Plan

- 単体：JSONL リーダー分割、`tool_execution_update` 累積表示変換、`extension_ui_request` 相関、`abort` 伝播、設定 sanitize
- 結合（mock gateway）：進捗・承認・タイムアウト・停止→部分保存の UI 結合
- 手動 live：要確認ツール混じり依頼の承認→続行→完了、拒否→中止、長時間実行→打ち切り＋回収
- セキュリティ：ユーザー間セッション混在なし、承認なし書き込み実行なし（allowlist 定義基準）

## Risks

- Functions↔gateway 間の SSE プロキシのタイムアウト・バッファリング（現行チャット SSE と同経路のため要実測）
- pi モデル側の不安定さ（本日も OpenCode Go 経由モデルで 404/検証エラーを観測）。基盤側 provider の選定とリトライ（`auto_retry`＋上限）が重要
- コスト：1依頼あたり多 LLM コール。上限制御とメトリクス監視で対応
- プロンプトインジェクション：完全防止不可が公式見解。読ませる範囲制限＋書き込み既定無効で緩和

## 対象外（本 plan では扱わない）

- 画像入力のエージェント対応（pi `prompt.images` 渡しは将来検討）
- タイトル生成のエージェント化（既存 `generateTitle` 流用を維持）
- 通常チャットのモデルカタログ変更
- ストア/Push 等の PWA 系拡張
