# P3-014: pi-web-access 導入 — plan

対応 spec: `specs/P3-014/spec.md`（v2・researcher移譲方式）

## Phase 0 — pi-subagents 基盤検証（先行）

- [ ] pi-subagents パッケージの Dockerfile 同梱状況を確認する。未同梱なら `agent/Dockerfile` に追加する（FR-1 の前提）

- [ ] gateway から pi-subagents 拡張を読み込み、researcher への移譲が動作することを実機検証する
- [ ] `agentSubagentModel` 設定項目との接続を確認する
- [ ] researcher 用 per-user dir・セッション配置を確定する（P3-010 sessions 方式と同型）
- [ ] 検証結果を `memo-phase0.md` に記録する。不成立の場合は代替案（メイン直載せ等）を提示し、ユーザー確認を取る
- [ ] 成果物レビュー（reviewer）→ GO で Phase 1 へ

## Phase 1 — researcher への Web 機能同梱

- [ ] `agent/Dockerfile` に `pi-web-access@0.28.0` をバージョン固定で同梱する
- [ ] researcher ランタイムが `--extension` で `index.ts` を読む（メインには載せない。メインは `--no-tools` 維持）
- [ ] researcher の有効ツールに `web_search`、`fetch_content` を追加（`dangerous` は空＝auto）。メイン側 `tools.allowlist.json` は変更しない。移譲ツールの allowlist 構成は確定次第 spec FR-3 に記録する
- [ ] キーなし最小構成（`web-search.json` なし）で起動することを確認する
- [ ] コンテナからの outbound 到達性（DuckDuckGo / Exa）を dev で実測確認する
- [ ] researcher 拡張（pi-subagents / pi-web-access）の読込失敗時に起動拒否されることをテストで確認する（fail-closed）
- [ ] 自動テスト（config・researcher許可・移譲）を追加し green を確認する
- [ ] 成果物レビュー（reviewer）→ GO で Phase 2 へ（RG-1）

## Phase 2 — 移譲ルーティング＋フロント表示

- [ ] Web検索タスクで researcher が引き当てられることをテストで確認する
- [ ] 引き当てられない場合は researcher 定義の description・AGENTS.md を調整し、調整内容を spec に記録する
- [ ] gateway がサブエージェントのライフサイクルイベント（開始／進捗／終了）を SSE で放出する（任意フィールド追加のみで後方互換維持）
- [ ] Functions がイベントを中継し、フロントが移譲状態（移譲先・タスク概要・実行中／完了／失敗・進捗）を表示する（`AgentProgress` 拡張または新設は実装時に確定）
- [ ] 移譲・実行ともに承認確認なしで動作することを確認する
- [ ] 自動テスト＋ローカル疎通で回帰なしを確認する（dev 環境へのデプロイは Phase 3）
- [ ] 成果物レビュー（reviewer）→ GO で Phase 3 へ（RG-2）

## Phase 3 — dev 検証・残課題整理

- [ ] dev デプロイ（手動。イメージは `az acr build`＋`az containerapp update`。P3-013 完成までは手動運用）
- [ ] E2E: Web検索→移譲→回答反映→フロント表示、および fetch_content によるページ取得→回答反映の一連動作を確認する
- [ ] 残課題（Tavily キー追加手順・prod 展開・`source_check` 等の対象外ツールの扱い）を整理し、バックログまたは本 plan に記録する
- [ ] 最終レビュー（reviewer。全体差分対象）→ GO で完了

## レビュー計画

- 各 Phase 成果物は reviewer で必ずレビューする
- RG-1: Phase 1 完了時（同梱・移譲・到達性）
- RG-2: Phase 2 完了時（ルーティング・フロント表示・回帰なし）
- 最終: Phase 3 完了時（全体差分）

## 変更履歴

| 日付 | ステータス | 備考 |
|------|-----------|------|
| 2026-09-06 | 初版 | spec v2 に基づき作成 |
