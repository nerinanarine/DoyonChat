# P3-014: エージェントへの pi-web-access 導入

## 概要

エージェント（pi RPC gateway）に `pi-web-access` 拡張を導入し、Web検索・ページ取得機能を提供する。APIキー不要のゼロコンフィグ動作を採用する。

## 背景

- P3-010 で導入した gateway は `--no-tools` 起動で、外部知識の参照手段がない
- コーディングエージェントが存在しないAPIを確信的に使う問題への対策として、実測参照手段が必要

## 方針（確定事項）

- **環境**: dev先行（Q2）
- **プロバイダ**: APIキー不要のゼロコンフィグ（Q3）。キーレス到達点（DuckDuckGo / Exa MCP）が実効経路になる。品質不足時は Tavily キー追加を別途検討
- **承認**: 読み取り専用のため確認なし（`auto`）（Q4）
- **前提**: P3-010（gateway が存在すること）

## 検討項目

- [ ] `Dockerfile` への `pi-web-access` 同梱方法（npm install＋`--extension` 読み込み。`approvalGate` と同方式）
- [ ] `web-search.json` の生成方法（キーなし最小構成。起動時生成かイメージ焼き込みか）
- [ ] allowlist（`tools.allowlist.json`）への `web_search` / `fetch_content` 等の追加と分類（`auto`）
- [ ] コンテナからの outbound 到達性確認（Exa / DuckDuckGo への疎通）
- [ ] 将来の Tavily キー追加手順（Key Vault→env→`web-search.json`。P3-010 の `OPENCODE_API_KEY` 方式と同型）

## 受け入れ条件

1. dev 環境のエージェントが Web検索を実行し、結果を回答に反映できる
2. ページ取得（`fetch_content`）が動作する
3. 承認確認なしで実行される（読み取り専用のため）
4. 既存の承認フロー・通常チャットに回帰がない

## 関連ファイル

- `agent/Dockerfile`
- `agent/src/config.ts`（拡張パス・allowlist）
- `agent/tools.allowlist.json`
- `infra/`（将来のキー追加時のみ）

## 依存関係

- **ブロックする:** なし
- **ブロックされる:** P3-010（対応済み）

## 実装メモ

> 対応後にここに実装内容・マージコミット・注意点を記載してください。

---

## 変更履歴

| 日付 | ステータス | 備考 |
|------|-----------|------|
| 2026-09-06 | 🔴 未対応 | 初期作成 |
