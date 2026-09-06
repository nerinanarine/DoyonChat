# P3-014: エージェントへの pi-web-access 導入

## 概要

エージェント（pi RPC gateway）に `pi-web-access` 拡張を導入し、Web検索・ページ取得機能を提供する。APIキー不要のゼロコンフィグ動作を採用する。Web検索系タスクはメインセッションで直接実行せず、pi-subagents の `researcher` に移譲する。pi-subagents 基盤の組み込みも本件に含める。

## 背景

- P3-010 で導入した gateway は `--no-tools` 起動で、外部知識の参照手段がない
- コーディングエージェントが存在しないAPIを確信的に使う問題への対策として、実測参照手段が必要

## 方針（確定事項）

- **環境**: dev先行（Q2）
- **プロバイダ**: APIキー不要のゼロコンフィグ（Q3）。キーレス到達点（DuckDuckGo / Exa MCP）が実効経路になる。品質不足時は Tavily キー追加を別途検討
- **承認**: 読み取り専用のため確認なし（`auto`）（Q4）。メイン→researcher への移譲自体も確認なし（Q10）
- **実行方式**: Web検索系タスクは pi-subagents の標準 `researcher` に移譲する（Q9）。メインセッションは `--no-tools` のまま、移譲ツールのみ
- **ルーティング**: Web検索が必要なタスクで researcher が引き当てられるよう、description・AGENTS.md の調整が必要になる可能性あり。テストで吸収する（Q9）
- **構成**: pi-subagents 基盤の組み込みは本件に含める。P3-015 はファイル機能のみに縮小（Q11）
- **前提**: P3-010（gateway が存在すること）

## 検討項目

- [ ] pi-subagents の gateway 組み込み実機検証（本件の先行課題。P3-010 の既知残件）
- [ ] researcher 用ランタイムへの `pi-web-access` 同梱方法（`--extension` 読み込み。メインセッションには載せない）
- [ ] `web-search.json` の配置（キーなし最小構成では不要。将来は researcher 用 per-user dir 直下）
- [ ] researcher のツール許可（`web_search` / `fetch_content` を researcher 側 allowlist に追加。メインは `--no-tools` 維持）
- [ ] 移譲ルーティングのテスト（Web検索タスク→researcher 引き当て。description・AGENTS.md 調整を含む）
- [ ] コンテナからの outbound 到達性確認（DuckDuckGo / Exa への疎通）
- [ ] 将来の Tavily キー追加手順（Key Vault→env→`web-search.json`。P3-010 の `OPENCODE_API_KEY` 方式と同型）

## 受け入れ条件

1. dev 環境のエージェントが Web検索を researcher 移譲で実行し、結果を回答に反映できる
2. ページ取得（`fetch_content`）が researcher 経由で動作する
3. 移譲・実行ともに承認確認なしで動作する
4. Web検索タスクで researcher が引き当てられる（テストで確認）
5. 既存の承認フロー・通常チャットに回帰がない
6. 移譲したサブエージェントの状態（実行中／完了／失敗・進捗）がフロントエンドに表示される

## 関連ファイル

- `agent/Dockerfile`（pi-subagents・pi-web-access 同梱）
- `agent/src/config.ts`（拡張パス解決・researcher 定義・researcher 側ツール許可）
- `agent/src/sessions.ts`（researcher 用 per-user 配置）
- `functions/src/`（サブエージェントイベントの SSE 中継。FR-7）
- `frontend/src/`（移譲状態の表示。FR-7）

## 依存関係

- **ブロックする:** P3-015（pi-subagents 基盤を本件で整備する）
- **ブロックされる:** P3-010（対応済み）

## 実装メモ

> 対応後にここに実装内容・マージコミット・注意点を記載してください。

---

## 変更履歴

| 日付 | ステータス | 備考 |
|------|-----------|------|
| 2026-09-06 | 🔴 未対応 | 初期作成 |
