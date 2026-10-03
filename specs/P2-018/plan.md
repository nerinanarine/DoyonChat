# Implementation Plan: Agent gateway ContainerAppのスケールゼロ化＋起動中ローディング

**Spec**: [specs/P2-018/spec.md](./spec.md) | **Branch**: `feat/p1-012-p2-018-p2-019-p3-016` | **Created**: 2026-10-03

## Design Decisions

- **D1 — infra変更は1行**: `agentPool.bicep:181` の `minReplicas` のみ変更する。プローブ追加はしない
- **D2 — 検出経路**: Functions に gateway `/models` 中継（`forwardGetModels`）を追加し、`forwardGetRun` と同型（MI Bearer・30秒 timeout）にする。`/health` では pi 未起動のため `/models` を優先する
- **D3 — UI再利用**: `LoadingState`＋P2-013 状態モデル（loading→loaded→error）＋P2-003 エラーUIを流用し、新規パターンを作らない
- **D4 — 実測先行**: ポーリング間隔・タイムアウトは dev実測値から決める。机上値で固定しない
- **D5 — dev先行**: infra 変更・UI とも dev で検証後に prod へ適用する

## Review Policy

- 各 Phase の成果物は完了条件として subagent `reviewer` によるレビューを必須とする（`reviewer` は読み取り専任。修正は `worker` が実施し、最終判断は parent が行う）
- レビュー観点：spec の受け入れ条件・FR との一致、既存動作の退行、機密情報のログ出力有無、今回差分外の変更混入

## Phases

### Phase 0 — 準備・dev実測
- [ ] dev 環境で 0→1 遷移中の挙動（保持/キュー/503）とコールドスタート時間を実測する
- [ ] 実測時に復帰後マウント挙動を記録し、P3-016 の再マウント前提の根拠に供する
- [ ] ポーリング間隔・タイムアウト値・再試行方針を実測値から決める
- [ ] backlog P2-018 を 🟡 進行中に更新する

### Phase 1 — Infra（dev）
- [ ] `infra/modules/agentPool.bicep` の `minReplicas` を `0` に変更する（`main.json` の再生成要否を確認する）
- [ ] dev へデプロイし、アイドル時レプリカ 0 と初回起動を確認する
- [ ] `reviewer` レビューを通過してから Phase 2 へ進む

### Phase 2 — 検出＋UI
- [ ] `functions/src/services/agentGateway.ts` に gateway `/models` 中継（`forwardGetModels`）を追加する
- [ ] 承認・run 照会経路のコールドスタート対応（起動中表示＋再試行）を追加する
- [ ] Frontend に起動中ローディング表示・タイムアウト→エラーUI遷移・再試行導線を追加する（既存パターン流用）
- [ ] テスト追加（タイムアウト・再試行・エラー遷移。gateway 実体は mock）
- [ ] ゼロ状態からの初回送信→起動中表示→応答の一連を dev で手動確認する
- [ ] `reviewer` レビューを通過してから Phase 3 へ進む

### Phase 3 — 仕上げ
- [ ] prod への適用と切戻し手順を記録する
- [ ] 全体横断の `reviewer` レビューを実施し、指摘を解消する
- [ ] backlog P2-018 の変更履歴を更新する（対応済み・コミット記載）
- [ ] コミット・プッシュ（要ユーザー承認）
