# P3-013: エージェントgatewayイメージのCI組み込み

## 概要

P3-010 で導入したエージェント gateway（`agent/`）のコンテナイメージビルド・配布が手動運用（`az acr build` の手実行）になっている。コード変更時にイメージ更新を忘れるとデプロイと実装が乖離するため、CI に組み込む。

## 背景

- 現状：`az acr build --registry <acr> --image doyonchat-agent-gateway:<tag> --file agent/Dockerfile agent` を手動実行し、`az containerapp update` で切り替えている
- gateway 更新（pi 拡張追加・承認ゲート改修など）のたびに手作業が必要で、更新漏れのリスクがある
- prod は git SHA タグでイメージを固定したい（現状 bicep 既定は `:latest`）

## 検討項目

- [ ] CI への `az acr build` ステップ追加（対象ブランチ・トリガ条件の定義）
- [ ] タグ戦略：dev は `:latest`、prod は git SHA タグ＋ bicep `imageName` への受け渡し
- [ ] ビルド対象に agent テスト（`npm run build`＋`npm test`）のゲートを含めるか
- [ ] ACR への push 権限（CI 用 ID の `AcrPush` または `Contributor`）の付与

## 受け入れ条件

1. `agent/` 配下の変更が main マージ時に自動でイメージビルドされる（または明示的な workflow_dispatch で実行できる）
2. prod デプロイは git SHA 等の一意識別子でイメージを指定でき、デプロイとコードの対応が追跡できる
3. ビルド失敗時はデプロイが進まない（fail-closed）

## 関連ファイル

- `agent/Dockerfile`
- `infra/modules/agentPool.bicep`（`imageName` パラメータ）
- `.github/workflows/deploy.yml` / `.github/workflows/ci.yml`
- `infra/agent-deploy.md`

## 依存関係

- **ブロックする:** なし
- **ブロックされる:** P3-010（エージェント gateway が存在することが前提）

## 実装メモ

> 対応後にここに実装内容・マージコミット・注意点を記載してください。

---

## 変更履歴

| 日付 | ステータス | 備考 |
|------|-----------|------|
| 2026-09-06 | 🔴 未対応 | 初期作成 |
