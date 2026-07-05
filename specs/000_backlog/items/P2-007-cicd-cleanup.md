# P2-007: CI/CD ワークフロー重複・クリーンアップ

## 概要

deploy.yml と CI/CD 周辺に複数の重複・不要な処理が存在する。

## 詳細

### 問題1: 未使用の GitHub Variables/Secrets
`AZURE_LOCATION`, `APP_SERVICE_NAME`, `STATIC_WEB_APP_NAME` はガイド/スクリプト/REAMDE で「必要」と表記されているが、ワークフローから一度も参照されない。Bicep の output（`apiAppName`）と `prod.parameters.json` からリソース名を取得する設計になっており不要。

### 問題2: `validate-infra` の `bicep build` が tracked file を上書き
`az bicep build --file infra/main.bicep` はデフォルトで `infra/main.json` を生成し、リポジトリ内の追跡ファイルを上書きする。CI 上でコミットはされないが `git status` のノイズになる。
→ `--stdout > /dev/null` または `--outfile /tmp/main.json` で回避。

### 問題3: `deploy-frontend` でビルドが二重実行される
`Azure/static-web-apps-deploy@v1` は `app_location` に `package.json` があれば自動で `npm install` & build を再実行する。事前に `npm run build` 済みなので無駄。
→ `skip_app_build: true` を指定して事前ビルド済みを明示。

### 問題4: `deploy-backend` の App Settings 更新が Bicep と重複
`infra/modules/appService.bicep` が既に `OPENCODE_GO_API_KEY` / `COSMOSDB_KEY` を appSettings として設定済み。`deploy-backend` で `az webapp config appsettings set` で同じ値を再設定しており責務が重複。
→ Bicep で一元管理するなら deploy ジョブ側の App Settings 更新ステップは削除。またはローテーション用途で残すなら bicep 側の該当 appSettings を削減。

## 受け入れ条件

- [ ] `setup-github-secrets.sh` とガイドから未使用の Variables/Secrets を削除
- [ ] `ci.yml` の `bicep build` が tracked file を上書きしない
- [ ] `deploy.yml` の `deploy-frontend` に `skip_app_build: true` が設定されている
- [ ] `deploy-backend` の App Settings 更新と Bicep の設定が重複しない（どちらかに統一）

## 関連ファイル

- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`
- `infra/modules/appService.bicep`
- `infra/scripts/setup-github-secrets.sh`
- `specs/003-setup-ci-cd-pipeline/setup-guide.md`
- `README.md`
