# Implementation Plan: OpenCode Go最新モデルカタログ追従

**Spec**: [specs/P2-019/spec.md](./spec.md) | **Branch**: `feat/p1-012-p2-018-p2-019-p3-016` | **Created**: 2026-10-03

## Design Decisions

- **D1 — 正は公式表**: 2026-10-03取得の公式Endpoints表（30件）を正とし、本ブランチの35件を正規化する
- **D2 — P2-011 と同型**: カタログ差分＋件数テスト更新＋live test の手順を踏襲する。新規手順は作らない
- **D3 — 中立メタデータ**: 追加7件の公開メタデータは中立値＋必要最小限の description とする
- **D4 — P2-016 吸収**: live test 30/30に grok-4.6 を含め、成功すれば P2-016 解消として backlog へ記録する

## Review Policy

- 各 Phase の成果物は完了条件として subagent `reviewer` によるレビューを必須とする（`reviewer` は読み取り専任。修正は `worker` が実施し、最終判断は parent が行う）
- レビュー観点：spec の受け入れ条件・FR との一致、公式表との一致、機密情報のログ出力有無、今回差分外の変更混入

## Phases

### Phase 0 — 準備
- [ ] 公式表（本spec記載の30件）とカタログ現状の差分を再確認する（`gpt-5.6-luna` が公式表に残存していることも明示確認する）
- [ ] backlog P2-019 を 🟡 進行中に更新する

### Phase 1 — カタログ更新＋unit test
- [ ] `functions/src/config/modelCatalog.ts`：削除12件の除去・追加7件の追加（指定プロトコル・中立メタデータ）
- [ ] 新規 deepseek 項目への `maxTokens` 方針適用、`kimi-k3` temperature 特例の維持確認
- [ ] `functions/tests/unit/modelCatalog.test.ts`：件数・内訳・順序を30件化する
- [ ] `functions/tests/integration/api.test.ts`：`GET /api/models` の固定リスト＋件数期待を30件化する
- [ ] `functions/live-tests/models.live.test.ts`：件数期待値を30に更新する
- [ ] `npm test`・ビルドが green であることを確認する
- [ ] `reviewer` レビューを通過してから Phase 2 へ進む

### Phase 2 — live test・ドキュメント同期
- [ ] `npm run test:live:models` を実行し、30/30成功を確認する（grok-4.6 含む）
- [ ] 失敗時は上流起因かを切り分け、P2-016 と同型で分離する
- [ ] README のモデル表と `specs/009-opencode-go-models/spec.md` の正規表を30件化する
- [ ] P2-011・P2-016 の backlog へ本件の参照・解消記録を追記する
- [ ] `reviewer` レビューを通過してから Phase 3 へ進む

### Phase 3 — 仕上げ
- [ ] P1-012 との整合（消費者削減後の `GET /api/models` 利用箇所）を確認する
- [ ] 全体横断の `reviewer` レビューを実施し、指摘を解消する
- [ ] backlog P2-019 の変更履歴を更新する（対応済み・コミット記載）
- [ ] コミット・プッシュ（要ユーザー承認）
