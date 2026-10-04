# Implementation Plan: ユーザー専用Azure Filesマウント・アーティファクト保存

**Spec**: [specs/P3-016/spec.md](./spec.md) | **Branch**: `feat/p1-012-p2-018-p2-019-p3-016` | **Created**: 2026-10-03

## Design Decisions

- **D1 — 配置規約の踏襲**: `<dataDir>/artifacts/{userId}/`（＋会話単位は実装時確定）。既存 `sessions/{userId}/`・`users/{userId}/` と同型、`assertSafeId` による traversal 対策を継承する
- **D2 — 認証規約の踏襲**: Storage アクセスキーは Key Vault 格納＋UAMI 参照（`opencode-api-key` と同型）。平文キーを bicep・env・ログに置かない
- **D3 — 配信規約の踏襲**: ダウンロードは Functions 経由＋`authenticateRequest`＋`verifyRunOwnership`（`agent.ts` と同型）
- **D4 — P3-015 非依存の検証**: Phase 1 はダミー配置でマウント・永続化を実証し、ファイル操作ツール（P3-015）を待たない
- **D5 — dev先行**: 全 Phase を dev で実証し、prod 適用は本ブランチ外で判断する。2026-10-03 オーナー承認済み：dev Azure リソースの作成可（`az login` 済み）。Infra 変更は bicep（CI/CD 含む）に反映する

## Review Policy

- 各 Phase の成果物は完了条件として subagent `reviewer` によるレビューを必須とする（`reviewer` は読み取り専任。修正は `worker` が実施し、最終判断は parent が行う）
- レビュー観点：spec の受け入れ条件・FR との一致、他ユーザー領域への到達可能性、シークレットの扱い、今回差分外の変更混入

## Phases

### Phase 0 — 準備・方式確定
- [ ] マウント方式（ユーザー別共有 vs 単一共有＋`{userId}` ディレクトリ）を確定する（既定：単一共有＋`{userId}`。ACAボリュームは revision 間固定のため確定後の変更は高コスト）
- [ ] ダウンロード配信経路を確定する（既定：Functions が Storage から直接読む）
- [ ] dev リリース前の gateway 認証前提（`GATEWAY_AUTH_*` 設定または ingress 制限）を確定する
- [ ] プロビジョニング方式（初回自動作成 vs 事前 IaC）を確定する
- [ ] gateway→client の生成通知方式を確定する
- [ ] backlog P3-016 を 🟡 進行中に更新する

### Phase 1 — Infra マウント＋配置（dev）
- [ ] Storage Account＋Azure Files 共有の bicep を追加する
- [ ] `agentPool.bicep` に `volumes`＋`volumeMounts` を追加し、Key Vault＋UAMI で配線する
- [ ] `sessions.ts` 系に `artifacts/{userId}/` 配置規約を追加し、ダミー配置で再起動後残存を dev実証する
- [ ] `reviewer` レビューを通過してから Phase 2 へ進む

### Phase 2 — ダウンロード配信＋UI
- [ ] Functions にダウンロード配信エンドポイント（所有者検証あり）を追加する
- [ ] Frontend にダウンロード導線を追加する
- [ ] 所有者外アクセス拒否のテストを追加する（mock、前提：実 Azure 不使用）
- [ ] 作成→ダウンロードの一連を dev で手動確認する
- [ ] コスト試算を記録する
- [ ] `reviewer` レビューを通過してから Phase 3 へ進む

### Phase 3 — 仕上げ
- [ ] P3-015・P2-018 との接続確認（保存先パスの一致・ゼロ復帰後の再マウント）を記録する
- [ ] コールドスタートを再計測し、P2-018 の実測値を更新する
- [ ] ストレージキーローテーション時の運用（マウント資格情報とKV secretは独立コピーのため、ローテーションで両方更新）を記録する
- [ ] 全体横断の `reviewer` レビューを実施し、指摘を解消する
- [ ] backlog P3-016 の変更履歴を更新する
- [ ] コミット・プッシュ（要ユーザー承認）
