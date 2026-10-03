# P3-014 Phase 1a 実装メモ（researcher への Web 機能同梱・コードのみ）

**期間**: 2026-09-06 | **Branch**: `feat/p3-014-agent-web-access` | **範囲**: Web機能の同梱・配線・自動テスト（実機 LLM 検証なし） | **次**: Phase 1b（実機検証）

## 変更ファイル

- `agent/Dockerfile`: `pi-web-access@0.28.0` をバージョン固定でグローバル同梱（pi-subagents 行の直後・同形式）
- `agent/src/config.ts`: `GatewayOptions.webAccessIndex` 追加＋`resolveWebAccessIndex` / `resolvePackageExtensionEntry` 実装
- `agent/src/sessions.ts`: `RESEARCHER_WEB_TOOLS` 定数＋`UserAgentSettings.webAccessIndex`＋`syncResearcherWebAccess` 実装
- `agent/src/server.ts`: `/prompt` の per-user settings 書込時に webAccessIndex を配線
- `agent/tests/config.test.ts` / `sessions.test.ts` / `approval.test.ts` / `server.test.ts` / `auth.test.ts`: テスト追加・型追随
- `specs/P3-014/spec.md`: FR-3 の allowlist 構成確定を記録（指示どおり）

## 実施内容

1. **同梱**: Dockerfile に `npm install -g pi-web-access@0.28.0`（バージョン固定。FR-2）
2. **index パス解決**（`resolveWebAccessIndex`）:
   - `AGENT_WEB_ACCESS_INDEX` 明示指定 → そのパスを使う。実体がない場合は起動拒否（fail-closed・要請どおり）
   - 未指定 → local/global node_modules から自動検出（package.json の `pi.extensions` → `main` → `index.ts`/`dist/index.js` の順）
   - 検出不能は `null`（機能オフ。任意機能のため未導入環境では起動を拒否しない）
   - メインセッションの `--extension` には一切追加しない（メインは `--no-tools` のまま）
3. **researcher 配線**（`syncResearcherWebAccess`）: per-user `settings.json` の
   `subagents.agentOverrides.researcher` に `subagentOnlyExtensions: [index]` と
   `tools`（既存 tool と `web_search`・`fetch_content` をマージ・重複排除）を書く。
   宣言的同期: 配線指定なし／pi-subagents 無効時は管理する researcher override を削除（残留配線防止）
4. **有効化条件**: メイン allowlist 非空（＝pi-subagents の packages 登録＋`subagent` ツール有効）かつ
   webAccessIndex が解決された場合のみ配線（server.ts）
5. **テスト**: 解決（明示・fail-closed・空無効）／配線（設定・マージ・削除）／HTTP 経由の配線（`/prompt`）

## 確定事項・判断

- 配線先は `subagents.agentOverrides.researcher`（memo-phase0 §3 の診断メッセージに基づく。child-only 経路）
- researcher `tools` は既存ツールとマージ（override 全置換による researcher 能力喪失を避ける意図）
- ワイヤリングは `includePackages`（pi-subagents 有効）に同期

## Phase 1b（実機検証）への申送り

1. **スキーマ一致確認**: `subagents.agentOverrides.researcher` が pi-subagents 0.65.1 の実スキーマと一致するか
   （`subagentOnlyExtensions` の位置・型。不一致なら配線先を `agents/researcher.md` 方式へ変更）
2. **index パス解決の実測**: グローバル install された pi-web-access の実エントリ（`index.ts` or `dist`）が
   `resolveWebAccessIndex` で解決されるか。`AGENT_WEB_ACCESS_INDEX` を明示せずに Docker build 相当で確認
3. **researcher tools の保持**: 既定 researcher の tool 一覧を実機で確認し、マージ方式で維持されているか
4. **移譲完走の再検証**: `subagentOnlyExtensions` 配線後に researcher が `web_search` / `fetch_content` を
   子で実行してターン内完了するか（Phase 0 は診断メッセージ取得まで）
5. **メイン allowlist の `subagent` 追加**: `tools.allowlist.json` の `tools` に `subagent` を入れる
   タイミングをユーザー確認の上決定（現状 `"tools": []` のため、このままだと配線は発火しない）
6. **コンテナ再現確認**（Phase 3 予定でも可）: global 同梱 3 パッケージの Docker build 疎通

## リスク・残課題

- schema 不一致の可能性（1b で是正。本実装は memo-phase0 の診断に基づく既知の経路のみ）
- `npm root -g` の spawn を解決時に毎回実行（既存 resolvePiEntry と同型のコスト。問題視しない）
- keyless プロバイダの実効フォールバックは 1b/3 で実測する（spec 未確認事項のまま）