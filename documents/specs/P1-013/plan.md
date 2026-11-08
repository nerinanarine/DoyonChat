# Implementation Plan: Agent実行モデル選択ドロップダウン（Pi model連動）

**Spec**: [specs/P1-013/spec.md](./spec.md) | **Branch**: `feat/p1-012-p2-018-p2-019-p3-016` | **Created**: 2026-10-04

## Design Decisions

- **D1 — 選択肢は30件再利用**: `GET /api/models`（P2-019正規30件）を両ドロップダウンの供給源にする。新規APIは作らない
- **D2 — 既定は `agentModel`**: 設定画面の選択は既存 `agentModel` 設定に保存する（テキスト入力→ドロップダウン置換）。保存値は `opencode-go/<modelId>` 形式に正規化し（gateway実行契約）、検証はbare抽出でカタログ照合する
- **D3 — 会話単位は新設フィールド**: `Conversation.agentModel?` を新設し、作成・更新・解決 precedence（override ＞ settings ＞ 未設定）を実装する。既存 `model` フィールドは触らない
- **D4 — 検証**: 保存時にカタログ検証（未知IDは400）。実行時は解決済み値を使う
- **D5 — P1-012境界**: 通常チャット経路には一切触れない

## Review Policy

- 各 Phase の成果物は完了条件として subagent `reviewer` によるレビューを必須とする（`reviewer` は読み取り専任。修正は `worker` が実施し、最終判断は parent が行う）
- レビュー観点：spec の受け入れ条件・FR との一致、P1-012削除範囲の不干渉、P2-018への退行、機密情報の扱い

## Phases

### Phase 0 — 準備
- [ ] backlog P1-013 を 🟡 進行中に更新する（本plan確定時）

### Phase 1 — 既定モデル（設定画面＋backend検証）
- [ ] `SettingsMenu` の `agentModel` テキスト入力を30モデルドロップダウンに置換する
- [ ] `PATCH /users/me/settings` の `agentModel` にカタログ検証（未知IDは400）を追加する
- [ ] 既存テスト更新＋新規テスト（選択・保存・拒否）
- [ ] `reviewer` レビューを通過してから Phase 2 へ進む

### Phase 2 — 会話単位override（ヘッダー＋永続化＋解決）
- [ ] `Conversation.agentModel?` フィールド追加（FE/BE型＋作成・更新API。`null` 解除含む）
- [ ] ヘッダーにドロップダウン追加（`models` 受け渡し・既定表示）
- [ ] `handleAgentChat` の解決 precedence（override ＞ settings ＞ 未設定）＋メッセージ記録
- [ ] テスト（維持・優先順位・旧会話互換）
- [ ] `reviewer` レビューを通過してから Phase 3 へ進む

### Phase 3 — 仕上げ
- [ ] 全体横断の `reviewer` レビューを実施し、指摘を解消する
- [ ] backlog P1-013 の変更履歴を更新する
- [ ] コミット・プッシュ（要ユーザー承認）
