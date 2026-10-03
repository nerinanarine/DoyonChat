# P3-014: エージェントへの pi-web-access 導入 — 仕様（叩き台 v2）

## 概要

エージェント gateway（`agent/`）に `pi-web-access@0.28.0` を同梱し、Web検索・ページ取得機能を提供する。Web検索系タスクはメインセッションで直接実行せず、pi-subagents の標準 `researcher` に移譲する。pi-subagents 基盤の組み込みも本件に含める。

## 背景

- P3-010 の gateway は `--no-tools` 起動で、外部知識の参照手段がない
- pi の `--no-tools` は built-in と extension の両方を無効化するため、researcher 側での拡張同梱＋ツール許可が必要
- pi-subagents の gateway 組み込みは P3-010 の既知残件。本件で実機検証する

## 確定事項（ユーザー回答済み）

- Q2: dev先行
- Q3: APIキー不要のゼロコンフィグ（DuckDuckGo がキーレス到達点としてコード保証あり）
- Q4/Q10: 読み取り専用のため承認確認なし。メイン→researcher への移譲自体も確認なし
- Q9: 標準 `researcher` を使用。Web検索タスクでの引き当ては description・AGENTS.md 調整で対応し、テストで吸収する
- Q11: pi-subagents 基盤は本件に含める。P3-015 はファイル機能のみに縮小
- 対象ツール（researcher 側）：`web_search`、`fetch_content`（`source_check` / `get_search_content` は対象外）

## 仕様

### FR-1: pi-subagents 基盤の組み込み

- gateway が pi-subagents 拡張を読み込み、メインセッションから researcher への移譲が動作すること
- 実現方式は per-user `settings.json` の `packages: ["npm:pi-subagents"]`＋Dockerfile global 同梱（バージョン固定）。pi が global node_modules から解決する（Phase 0 実機確認済み。per-user 毎の npm install は発生しない）
- P3-010 で確保済みの `agentSubagentModel` 設定項目と接続すること
- researcher 用の per-user dir・セッション配置は P3-010 の sessions 方式と同型とする

### FR-2: pi-web-access の researcher 側への同梱

- `agent/Dockerfile` に `pi-web-access@0.28.0`（バージョン固定）を同梱する
- researcher ランタイムが既存の拡張読み込み方式（`--extension <path>`）で `index.ts` を読む（pi は TS 直接ロード可）
- メインセッションには載せない（メインは `--no-tools` のまま）
- 読込失敗時の扱い：`AGENT_WEB_ACCESS_INDEX` の明示指定不備は起動拒否（fail-closed）。自動解決不能は機能オフ（起動継続）。FR-3 の確定記録どおり

### FR-3: researcher 側のツール許可

- researcher の有効ツールに `web_search`、`fetch_content` を追加する
- `dangerous` 分類は空（auto運用）。移譲・実行ともに承認確認なし
- メイン側の `tools.allowlist.json` は変更しない
- **確定した allowlist 構成（Phase 1a 実装）**: メインの `tools.allowlist.json` とは別に、
  per-user `settings.json` の `subagents.agentOverrides.researcher` へ
  `subagentOnlyExtensions: [<pi-web-access index パス>]` と `tools`（既存＋`web_search`・
  `fetch_content` のマージ）を書く。パスは `AGENT_WEB_ACCESS_INDEX` 明示指定（実体必須・
  fail-closed）または local/global node_modules からの自動解決で得る。
  researcher への配線が有効になるのはメイン allowlist が非空（＝pi-subagents が
  packages 登録され、`subagent` ツール有効）のときのみ

### FR-4: 移譲ルーティング

- Web検索が必要なタスクで researcher が引き当てられること
- 調整内容は本 spec に記録する
- **Phase 2 の確定記録**: 標準 researcher 定義のままで引き当て成立（live で `args.agent==="researcher"` 確認済み。Phase 1b/2 とも再現）。description・AGENTS.md の調整は不要と判断。LLM の引き当ては確率的なため自動テストにできないが、パイプライン（SSE 正規化→表示）はユニットテストで固定する

### FR-5: 設定

- キーなし最小構成では `web-search.json` を生成しない（不在時は `{}` 扱いで keyless プロバイダが有効）
- 将来のキー追加時は researcher 用 per-user dir 直下（＝`PI_CODING_AGENT_DIR` 直下）に配置する

### FR-6: 非機能

- コンテナからの outbound 到達性（DuckDuckGo / Exa）を dev で実測確認する
- 既存の承認フロー・通常チャットに回帰がないこと（自動テスト green＋dev 疎通）

### FR-7: 移譲エージェントのフロントエンド表示

- 移譲したサブエージェントの状態をフロントエンドに表示する
- 表示内容：移譲先（researcher）・タスク概要・状態（実行中／完了／失敗）・進捗
- gateway がサブエージェントのライフサイクルイベント（開始／進捗／終了）を SSE で放出し、Functions が中継、フロントが描画する（P3-010 の `AgentProgress` 方式と同型。拡張または新設は実装時に確定）
- 既存 SSE 契約は後方互換を維持する（任意フィールド追加のみ）
- **Phase 2 の確定方式**: gateway は既存の raw パススルー（`tool_execution_start/update/end`、`toolName:"subagent"`、`args.agent/task`）で発生源を成立させ、Functions は `sseRaw` パススルーで中継（agent/functions の変更不要）。フロントは `AgentProgress` を拡張し、`normalizeAgentEvent` で agent/task を抽出する。`tool_execution_end` は args を持たないため、同一 `toolCallId` の agent 名をストリーム内 Map で引き継ぐ

## 受け入れ条件（バックログ対応）

1. dev 環境のエージェントが Web検索を researcher 移譲で実行し、結果を回答に反映できる
2. ページ取得（`fetch_content`）が researcher 経由で動作する
3. 移譲・実行ともに承認確認なしで動作する
4. Web検索タスクで researcher が引き当てられる（テストで確認）
5. 既存の承認フロー・通常チャットに回帰がない
6. 移譲したサブエージェントの状態（実行中／完了／失敗・進捗）がフロントエンドに表示される

## 関連ファイル

- `agent/Dockerfile`
- `agent/src/config.ts`（拡張パス解決・researcher 定義）
- `agent/src/sessions.ts`（researcher 用 per-user 配置）
- `agent/tests/`（移譲・ルーティングのテスト追加）
- `functions/src/`（サブエージェントイベントの SSE 中継）
- `frontend/src/`（移譲状態の表示。`AgentProgress` 拡張または新設）

## 依存関係

- **ブロックする:** P3-015（pi-subagents 基盤を本件で整備する）
- **ブロックされる:** P3-010（対応済み）

## 未確認事項（実装時に確定）

- pi-subagents の gateway 実機動作（本件の先行検証事項）
- **Phase 1b 実機検証事項**: `subagents.agentOverrides.researcher` のスキーマ一致・
  `subagentOnlyExtensions` の index パス解決（npm パッケージの実エントリ）・既存
  researcher tools との合流方式の妥当性・メイン allowlist への `subagent` 追加タイミング
- keyless 時の実効フォールバック（dev 実測で確定）
- peerDeps の global install 解決（ビルド検証で確定）

---

## 変更履歴

| 日付 | ステータス | 備考 |
|------|-----------|------|
| 2026-09-06 | 叩き台 | scout調査に基づき作成 |
| 2026-09-06 | 叩き台 v2 | researcher移譲方式（Q9〜Q11）に書き換え |
