# P3-014 Phase 1b 実装メモ（実機検証 — 完走確認）

**期間**: 2026-09-06 | **Branch**: `feat/p3-014-agent-web-access` | **状態**: Phase 1 完了（RG-1 レビュー待ち）

## Phase 1a の完了内容（worker 実施・supervisor 確認済み）

- `agent/Dockerfile` に `pi-web-access@0.28.0` をバージョン固定で同梱
- `config.ts` に `GatewayOptions.webAccessIndex`＋`resolveWebAccessIndex`（明示指定は fail-closed、自動検出、解決不能は null で機能オフ）
- `sessions.ts` に `RESEARCHER_WEB_TOOLS`＋`syncResearcherWebAccess`（`subagents.agentOverrides.researcher` へ `subagentOnlyExtensions`＋tools マージ。宣言的同期で残留削除）
- `server.ts` はメイン allowlist 非空かつ解決時のみ配線。メインの `--extension` には載せない
- spec FR-3 に allowlist 構成を記録済み
- jest 104 件 green（`piClient.real.test.ts` の単発失敗は再実行で green。実 pi 起動タイミングの flaky）

## 1b の完走確認（2026-09-06 再挑戦で完走）

再挑戦で researcher 移譲→Web実行→回答反映の完走を確認した。鍵となった追加修正：

- **追加修正**: `writeSubagentExtensionConfig`（`sessions.ts`）＋`server.ts` からの呼出。`extensions/subagent/config.json` に `{"asyncByDefault": false}` を書き、子を foreground 化する。背景：初回完走試行では researcher が background 化し、turn が結果なしで settle した（`memo-phase0.md` §2 の delegate 検証時は per-user config で手動設定していたため気づかなかった）。テスト3件追加（sessions.test.ts）
- **web_search 完走**: researcher 移譲→Web検索→回答反映→`done:true`。最終回答に live データ（pi 0.85.1・2026-09-05 リリース）が含まれ、実検索の証跡あり。`approvalRequest` 0 件（承認確認なし）。使用プロバイダは keyless（`web-search.json` なし・生成せず起動。到達性は DuckDuckGo への HTTP 200 で別途確認）
- **fetch_content 完走**: researcher 経由で `https://example.com` の title（"Example Domain"）を取得・回答反映→`done:true`

### 検証時の環境知見（本番への持越し）

1. **npm レジストリ到達の遅延**：`npm view` で 48s、per-user install で 13min の時間帯あり。検証は事前 seed（per-user `npm/` に `pi-subagents` を前倒し install）で回避した。dev デプロイ時に初回移譲の所要時間を実測すること
2. **opencode 既定プロバイダの残高不足**：既定モデルは `401 CreditsError: Insufficient balance`。dev E2E は opencode-go 系の明示指定が必要。残高はユーザー側でチャージ要否を判断すること
3. **検証用 allowlist は一時ファイル**（`AGENT_TOOLS_FILE`）：リポジトリの `tools.allowlist.json` は `tools: []` のまま。`subagent` 追加タイミングはユーザー確認事項

## 1b の実施内容と結果（初回・環境起因で停滞した記録）

### 確認できたこと

- gateway ローカル起動＋`/prompt` 経路は正常（`--tools subagent` 付き起動・`/health` ok）
- researcher 配線は発火する（per-user `settings.json` に `agentOverrides.researcher.{subagentOnlyExtensions, tools}` が正しく書かれる）
- 素の `pi --mode rpc` は応答する（turn 開始まで到達）
- 上流モデル自体は正常（zen/go の raw `chat/completions` は deepseek-v4-flash で 4.3s 応答。API キー有効）
- gateway＋明示モデル（opencode-go/deepseek-v4-flash）での素 prompt は完走した（`finalText: OK`。配線なし構成）

### 未完のもの（BLOCK）→ 解消済み

- ~~researcher 移譲→`web_search` 実行→回答反映の完走は未確認~~ → 再挑戦で完走確認（上記）
- ~~直接 pi＋researcher 配線設定での turn が assistant 応答なしで停滞する~~ → 主因は researcher の background 化（追加修正で解消）。残りの揺れは npm 遅延・上流混雑の時間帯要因

### 原因分析（環境起因と判断）

1. **npm レジストリ到達の極端な遅延**：`npm view` で 48s、per-user `npm install pi-subagents` で 13min。pi の `packages: ["npm:pi-subagents"]` 解決が fresh per-user dir 毎に低速 npm anta を踏む
2. **opencode 既定プロバイダの残高不足**：既定モデル（kimi-k2.6→opencode）は `401 CreditsError: Insufficient balance`。dev E2E は opencode-go 系モデルを使うこと
3. 上記が重なり、1b の検証がタイムアウト内に完走しない。コード起因の不具合を示す証拠はない（配線・設定・起動の各層は個別に正常確認済み）

## 本番への持越し（重要）

- **初回 per-user の npm 解決 latency**：コンテナ（Azure・高速回線）では軽微と想定するが、dev デプロイ時に初回移譲の所要時間を実測し、問題があれば対策（イメージ内への事前配置・`packages` 解決の見直し）を検討する
- **モデル指定**：dev E2E は opencode-go 系（deepseek-v4-flash 等）を明示指定する。既定モデルは残高不足で 401 になる
- opencode 残高不足はユーザー側でチャージ要否を判断すること

## 残課題（Phase 2/3 へ）

- researcher 移譲→web 完走の実機確認（dev デプロイ時・Phase 3 E2E で実施）
- `AGENT_TOOLS_FILE` 既定への `subagent` 追加タイミング（ユーザー確認事項。現状 `tools: []` のため配線は発火しない）
- FR-7（フロント表示）は Phase 2 で実装

---

## 変更履歴

| 日付 | ステータス | 備考 |
|------|-----------|------|
| 2026-09-06 | 1b BLOCK（環境起因） | 1a は完了・green。完走確認は dev デプロイ時に実施 |
| 2026-09-06 | Phase 1 完了 | 再挑戦で完走確認（foreground 化修正＋web/fetch の live 検証）。RG-1 レビューへ |
