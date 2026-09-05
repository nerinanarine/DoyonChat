# DoyonChat Agent Gateway (P3-010 Phase 0 PoC)

Azure Functions から分離したエージェント実行基盤の入口。pi coding agent を
`--mode rpc`（JSONL over stdin/stdout）で駆動する子プロセスを所有し、最小の中継を行う。

Phase 0 のスコープ（[`specs/P3-010/plan.md`](../specs/P3-010/plan.md) Phase 0）:

- pi 子プロセス起動・`prompt`→`agent_settled` の最小中継
- **LF のみで分割する独自 JSONL リーダー**（Node `readline` は U+2028/U+2029 でも分割するためプロトコル非準拠・不使用）
- タイムアウト・異常終了時の安全コード返却とプロセス回収
- 実 pi に対する非 LLM コマンド（`get_state` 等）の往復

## 前提

- Node.js 20+（ローカル確認は Node 24 で実施）
- pi は任意（`get_state` の実機往復テストにのみ使用。無くてもユニットテストは pass する）

## インストールとビルド

```bash
cd agent
npm install
npm run build          # tsc → dist/
npm run build:check    # tsc --noEmit（CI 向け）
```

## テスト

```bash
npm test    # jest（JSONL分割 / PiClient / サーバー / 実pi get_state）
```

- 実 pi が PATH に無い場合は `tests/piClient.real.test.ts` のみ自動スキップされる。
- `AGENT_SKIP_REAL_PI=1` で明示的にスキップできる。
- 実 pi テストは **LLM を消費しない `get_state` のみ**。`prompt` の実機投げは Phase 1 以降。

## 起動

```bash
npm start   # build + node dist/index.js
# GATEWAY_PORT / GATEWAY_HOST / AGENT_PROMPT_TIMEOUT_MS / PI_BIN を env で変更可
# 既定 GATEWAY_HOST=127.0.0.1（loopback のみ。コンテナ公開時は 0.0.0.0 を明示。Phase 3 で認証追加まで）
# その他: AGENT_APPROVAL_TIMEOUT_MS（既定120000） / GATEWAY_HEARTBEAT_MS（既定15000） /
#   GATEWAY_RUN_TTL_MS（既定600000） / GATEWAY_REGISTRY_MAX（既定200） / GATEWAY_MAX_RUNS（既定4、上限超過は429） /
#   AGENT_MODEL_SCOPE（カンマ区切り、空は全許可） / AGENT_DATA_DIR（既定./data） / AGENT_EXTENSIONS（上書き）
# POST /prompt 追加body: approvalLevel（auto/dangerous-only/always）/ dangerousTools（最大50件）/
#   model（provider/id 形式）/ userId＋conversationId（組指定・ID検証あり）/ subagentModel
# GET /models（スコープ済み一覧） / DELETE /sessions（会話削除時の破棄用）
```

Windows では `pi` が npm シェルシムの場合、Node の `spawn` が直接起動できないため、
グローバルインストール先の JS エントリ
（`<npm root>/@earendil-works/pi-coding-agent/dist/bundle/cli.js`）を自動解決して
`node <clijs> --mode rpc ...` で起動する。`PI_BIN=<path/to/cli.js>` で明示指定も可能。

既定の pi 起動形は `--mode rpc --no-session --no-tools`（D3: ツール全無効）。

## エンドポイント

### GET /health

生存確認。pi 構成も返す。

```bash
curl -s http://localhost:8787/health
# {"status":"ok","pid":1234,"uptimeMs":42,"piBin":"...","piArgs":[...]}
```

### POST /prompt

`{message}` を pi に送り、RPC イベントを SSE でそのまま中継。完了時に
`{"done":true,"finalText":"..."}` を送出して close する。失敗時は安全コードのみ
（`{"error":{"code":"timeout"|"server"|"network"}}`）。

```bash
curl -N -s -X POST http://localhost:8787/prompt \
  -H 'Content-Type: application/json' \
  -d '{"message":"hello"}'
```

（実 pi に `prompt` を送ると LLM を消費するため、確認は stub か Phase 1 で実施すること）

## 検証手順（ローカル smoke）

```bash
npm run build

# 1) stub pi で中継確認
node dist/index.js &
curl -s http://localhost:8787/health
curl -N -s -X POST http://localhost:8787/prompt -H 'Content-Type: application/json' -d '{"message":"hi"}'
kill %1

# 2) ユニットテストで回収・タイムアウト・JSONL分割を確認
npm test
```

## 構成

```
agent/
  src/
    config.ts     # env 設定と pi 起動形の解決（Windows シム対策含む）
    errors.ts     # 安全コード契約（AgentSafeErrorCode）
    jsonl.ts      # LF のみ分割の JSONL パーサ（readline 不使用）
    piClient.ts   # pi 子プロセス所有: command / runPrompt / terminate
    server.ts     # 最小 HTTP: /health, /prompt(SSE)
    index.ts      # エントリポイント
  tests/
    fixtures/     # stub pi（piStub / piCrash / piSilent）
    jsonl.test.ts / piClient.test.ts / piClient.real.test.ts / server.test.ts
```

## 残課題（Phase 1 への持越し）

- 進捗イベントの SSE 変換（`tool_execution_*`・thinking）、承認フロー（`extension_ui_request`）、heartbeat
- 停止の伝播（SSE 切断検知→`abort`→部分保存）、実行状態取得エンドポイント
- 会話 ID↔pi セッション対応・同時実行数上限・allowlist レジストリ
- gateway の認証（Functions 経由の外出しは Phase 0 では未実装。ローカル専用）