# P2-007: CI/CD ワークフロー重複・クリーンアップ

> **現行構成に関する注記:** P2-006完了により、旧App Service・App Service Plan・`deploy-backend`は削除済みです。以下のApp Service固有の問題記述は履歴として残し、現在のFunctions CI/CDの整理対象と区別してください。

## 概要

deploy.yml と CI/CD 周辺に複数の重複・不要な処理が存在する。

## 詳細

### 問題1: 未使用の GitHub Variables/Secrets
`AZURE_LOCATION` と `STATIC_WEB_APP_NAME` はガイド/スクリプト/READMEで「必要」と表記されているが、現行ワークフローではBicepのoutput（`functionAppName` / `functionApiUrl`）からリソース情報を取得するため、未使用である。`APP_SERVICE_NAME` はP2-006で削除済み。

### 問題2: `validate-infra` の `bicep build` が tracked file を上書き
`az bicep build --file infra/main.bicep` はデフォルトで `infra/main.json` を生成し、リポジトリ内の追跡ファイルを上書きする。CI 上でコミットはされないが `git status` のノイズになる。
→ `--stdout > /dev/null` または `--outfile /tmp/main.json` で回避。

### 問題3: `deploy-frontend` でビルドが二重実行される
`Azure/static-web-apps-deploy@v1` は `app_location` に `package.json` があれば自動で `npm install` & build を再実行する。事前に `npm run build` 済みなので無駄。
→ `skip_app_build: true` を指定して事前ビルド済みを明示。

### 問題4: 旧App ServiceのApp Settings重複（解消済み）
P2-006で旧App Serviceと`deploy-backend`を削除し、Functionsのアプリ設定はBicepの`functions.bicep`に集約した。この問題は解消済みであり、現在はFunctions Action、workflow権限、未使用Variablesなどの残課題を整理する。

## 受け入れ条件

- [ ] `setup-github-secrets.sh` とガイドから未使用の Variables/Secrets を削除
- [ ] `ci.yml` の `bicep build` が tracked file を上書きしない
- [ ] `deploy.yml` の `deploy-frontend` に `skip_app_build: true` が設定されている
- [x] 旧App ServiceのApp Settings 更新とBicepの重複を解消（P2-006で旧ジョブ・リソースを削除）

## 関連ファイル

- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`
- `infra/modules/functions.bicep`
- `infra/scripts/setup-github-secrets.sh`
- `specs/003-setup-ci-cd-pipeline/setup-guide.md`
- `README.md`
