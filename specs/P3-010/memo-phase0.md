# Phase 0 実装メモ（PoC）

**期間**: 2026-09-04 | **Branch**: `feat/p3-010-ai-agent` | **Review gate**: PoCレビュー（reviewer・読み取り専用）→ **GO for Phase 1**（BLOCK なし）

## 成果物

- `agent/` 新規：gateway 雛形（`src/server.ts` `/health`＋`POST /prompt` SSE 中継、`src/piClient.ts` pi RPC 所有、`src/jsonl.ts` LF のみ分割、`src/config.ts`、`src/errors.ts`）、jest 19件、fixtures 3種、`Dockerfile`（pi@0.85.0 固定）
- 検証：`npm run build:check` clean、`npm test` 19/19 green（実 pi `get_state` 往復含む・LLM 非消費）、docker build＋`/health` 疎通確認済み

## レビュー指摘と対応

- F1 parse_error の生行 SSE 中継 → 型のみ中継に修正（`server.ts`）
- F2 プロンプト本文のログ出力 → 長さのみに修正（`server.ts`）
- F3 spawn フェイルセーフ時のゾンビ → `SIGKILL` 追加（`piClient.ts`）
- F4 exit ハンドラーの `destroy()` による終端データ破棄の恐れ → `destroy` 除去（自然 close に委ねる）
- F5 切断系テストの抜け → 切断→回収テスト追加。実装中に `req.on('close')` では切断検知できないことを実機確認し、`res.on('close')`＋`writableEnded` ガードに修正（`server.ts`）
- F6 Dockerfile の pi 未固定 → `0.85.0` に固定
- F7–F9（Windows シム解決・NaN バリデーション・SIGTERM 時の子回収）→ nit として Phase 1 へ持越し

## Phase 1 への持越し

- 承認ゲート pi 拡張、SSE 変換・heartbeat、承認 API、実行状態取得、停止伝播、フロント、設定拡張（plan Phase 1 の通り）
- RG-1（Phase 1 完了時レビュー）
