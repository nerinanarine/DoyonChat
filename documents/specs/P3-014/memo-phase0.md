# P3-014 Phase 0 実装メモ（pi-subagents 基盤検証）

**期間**: 2026-09-06 | **Branch**: `feat/p3-014-agent-web-access` | **Review gate**: Phase 0 レビュー（reviewer）→ GO for Phase 1

## 前提と検証方法

- 対象: `agent/`（gateway）＋実 pi（`pi 0.85.0`、Windows ローカル）＋`pi-subagents@0.65.1`
- 方法: gateway（`dist/index.js`）をローカル起動し、`POST /prompt` に `userId/conversationId/model/subagentModel/approvalLevel:auto` を付与して researcher/delegate への移譲を実機確認。A/B で pi-subagents の解決経路も確認
- 検証用 allowlist: `{"tools":["subagent"],"dangerous":[]}`（移譲ツールのみ。`--tools subagent` で有効化）
- pi-subagents の既定は async で子がバックグラウンド化するため、検証では per-user config（後述）で `asyncByDefault:false` にし、ターン内完了を確認

## 成果物（変更ファイル）

- `agent/Dockerfile`: `pi-subagents@0.65.1` をバージョン固定で同梱（global npm install。pi 本体の直後）
- `specs/P3-014/memo-phase0.md`: 本ファイル

## 検証結果

### 1. pi-subagents の読み込みは packages（settings.json）経由で実現する

- gateway は `writeUserAgentSettings(..., includePackages = tools.length > 0)` で per-user 設定（`users/{userId}/config/settings.json`）へ `packages: ["npm:pi-subagents"]` を書く（P3-010 済みの機構）
- pi は settings.packages を **pi 自身のモジュール解決経路**（global node_modules から）で解決することを実機確認：
  - global に `pi-subagents@0.65.1` を入れた状態 → `subagent` ツール有効・移譲成功
  - global を外した状態 → `subagent` ツール不在で `/prompt` がタイムアウト（per-user への自動 npm install は発生しない）
- よって **Dockerfile への global 同梱（バージョン固定）が正しい方法**。per-user 毎のランタイム npm インストール（数分の latency）は発生しない

### 2. 移譲が動作する（foreground 子＋builtin ツール）

- `subagent` ツールで `agent:"delegate"`（builtin 系）を起動 → exit 0・成果物生成・親が結果をターン内返却（FINAL_TEXT に brief 反映、`done:true`）
- 子プロセスの model は `subagentModel` リクエスト値が反映（`subagents.defaultModel` → 子へ）。実測 `opencode-go/deepseek-v4-flash`、durationMs≈7.4s、cost≈\$0.001
- 移譲・実行ともに approvalLevel:auto で確認ダイアログなし（`extension_ui_request` confirm は未発生）

### 3. researcher は web 系ツールを子で使うために追加配線が必要（Phase 1 の前提発見）

- `agent:"researcher"` を foreground 起動したところ、以下の決定的な診断メッセージを得た：
  > `Agent 'researcher' requested unavailable child tools: web_search, fetch_content, get_search_content.` … `For extension tools, add the provider path to subagentOnlyExtensions (child-only), extensions, or as a path-like entry in tools, while keeping each registered tool name in tools.`
- つまり **子エージェントの `tools:` は厳格な allowlist であり、拡張ツールは provider パスを明示しないと子に載らない**。foreground 子は ambient 拡張を一切読み込まない
- Phase 1 で `pi-web-access@0.28.0` を researcher に載せる場合は、researcher 定義（per-user `agents/researcher.md` または `subagents.agentOverrides`）に `subagentOnlyExtensions: ["<pi-web-access index.ts のパス>"]` を追加し、`tools` にツール名を保持する方式が正（pi-subagents 本体のメッセージが示す child-only 経路）
- 代替（background 子 `async:true`）は ambient 拡張を読むが、完了通知がターン後に届くため gateway の run ライフサイクル（prompt→settle→終了）と整合しない。P3-014 では foreground 子＋`subagentOnlyExtensions` を第一候補とする

### 4. per-user dir・セッション配置の確認（P3-010 方式と同型で成立）

- `users/{userId}/config/settings.json`: `subagents.defaultModel`＋`packages` が正しく書かれる（既存 writeUserAgentSettings のまま）
- `users/{userId}/config/extensions/subagent/config.json`: pi-subagents の設定位置（`{"asyncByDefault": false}`）。per-user 化は P3-010 の `userConfigDir` 配下にそのまま乗る（新規書込関数は Phase 1 で追加）
- 会話セッション: `sessions/{userId}/{conversationId}.jsonl`（従来どおり）
- 子の成果物: `sessions/{userId}/subagent-artifacts/{runId}_{agent}_0_{input|output|meta|transcript}.{md|json|jsonl}` に格子状に生成される（P3-015 のファイル成果物基盤になる）

## 確定事項

1. pi-subagents の同梱方法は **Dockerfile global install（バージョン固定）**。packages 経由で pi が解決する（Per-user npm install 不要）
2. 移譲は **foreground 子（`asyncByDefault: false`）** を第一候補とし、gateway の run ライフサイクルに収める
3. Phase 1 の researcher 用 pi-web-access 接続は `subagentOnlyExtensions`（child-only）方式で実装・実機検証する
4. モデルは既存の `subagentModel` → `subagents.defaultModel` 経路がそのまま使える

## 残課題（Phase 1 へ持越し）

- researcher 定義への `subagentOnlyExtensions` 配線（パス解決と実機確認）
- `subagentOnlyExtensions` 配線後の researcher 移譲の完走再検証（Phase 0 では診断メッセージ取得まで）
- Docker build の smoke 確認の前倒し（peerDeps の global 解決確認）
- `users/{userId}/config/extensions/subagent/config.json` の書込（writeUserAgentSettings 相当の新設 or 拡張）
- 移譲イベントの SSE 可視化（FR-7: setWidget/status 系の扱い。Phase 2）
- `AGENT_TOOLS_FILE` 既定（`subagent`）の決定（allowlist 切替。Phase 1）
- コンテナでの再現確認（global 同梱の Docker build＋dev デプロイ。Phase 3）