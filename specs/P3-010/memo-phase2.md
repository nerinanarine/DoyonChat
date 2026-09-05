# Phase 2 実装メモ（セッション対応・ツール・モデル・Functions経路・上限）

**Branch**: `feat/p3-010-ai-agent` | **Review gate**: RG-2（実施予定）

## live test 結果（実 pi・安価モデル・最小プロンプト。2026-09-05）

- **F6a/b 文脈引継ぎ: OK**。別プロセスの2 run が同一セッションファイルで `HELLO-SESSION` を想定通り引き継いだ
- **F2 モデル状態: 確認**。セッションファイルは `model` を保持する（別プロセス復元で既定と異なる `kimi-k2.6` が記録されていた）。対策として `AGENT_DEFAULT_MODEL`（起動時検証）＋ switch 後の常時 `set_model` pin を実装。未指定時のみセッション保持モデルが勝つ（仕様として明記）
- **F11a 承認実機: OK**。実 pi の `tool_call` →自作ゲートの confirm→SSE→承認→ツール実行→回答（`PINEAPPLE` 読み取り成功）
- **F11b 中断実機: OK**。confirm 待ち中の切断で pi は abort に即応しないが、承認タイムアウト（20s）で自動拒否→エージェント settle→`interrupted` として記録・再取得できた。設計通りの安全側動作
- **副次発見1**: `deepseek-v4-flash` は上流無応答で180sハング（P2-016系の不安定と同根の可能性）。モデル別フォールバックは将来課題
- **副次発見2**: per-user `PI_CODING_AGENT_DIR`＋`packages:[npm:pi-subagents]` で初回起動に npm 数千ファイル展開（数分）が発生。対策として packages 登録をツール有効時のみに限定（宣言的同期）。初回 latency は Phase 3 運用メモへ
- **副次発見3**: per-user 設定 dir には auth が無いため、鍵はサーバー env（`OPENCODE_API_KEY`）経由が必須。本番は Key Vault→env で供給する（Phase 3）

## モデル優先関係（確定）

- エージェント実行のモデル：リクエスト `model` ＞ `AGENT_DEFAULT_MODEL` ＞ 未指定（セッション保持モデル）
- `conversation.model` はエージェント実行には使わない（表示・妥当性チェックのみ維持）
- ユーザー設定 `agentModel` は Functions が gateway `model` へ転送する

## 残件（Phase 3 へ）

- pi-subagents のイメージ同梱手順（npm 導入＋初回展開の扱い）。初回 latency は事前展開・進捗表示で対応検討
- gateway `Authorization` 検証、`agentPool.bicep`、メトリクス、kill switch E2E
- **run 所有者検証（RG-2 F1 must-fix）。公開前・RG-3 までの必須条件**
- 会話削除時のセッション破棄接続（RG-2 F2）、モデル不在表示の除外（RG-2 F3）、フラグ配線（RG-2 F4）
