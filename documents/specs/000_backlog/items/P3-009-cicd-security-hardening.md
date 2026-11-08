# P3-009: CI/CD セキュリティハードニング

## 概要

GitHub Actions のセキュリティ強化（サプライチェーン耐性・最小権限の原則）。個人プロジェクトなので優先度は低め。

## 詳細

### 問題1: アクションのタグピン
`setup-node@v4`, `azure/login@v2`, `dorny/paths-filter@v3` などがタグピン（可変）。アクションのリポジトリが侵害された場合、悪意のあるコードが自動的に適用されるリスクがある。
→ SHA ピン（コミットハッシュ）に変更し、dependabot で更新を管理。

### 問題2: ワークフロー全体の permissions 宣言
`ci.yml` は `changes` ジョブにのみ `permissions` を付与しているが、`test-backend` / `validate-infra` ジョブはリポジトリ既定権限に依存している。`deploy.yml` は全体で未宣言。
→ ワークフロールートで `permissions: contents: read` を宣言し、必要なジョブのみ追加権限を付与する最小権限設計に。

## 受け入れ条件

- [ ] サードパーティアクションが SHA ピンに変更されている
- [ ] `.github/dependabot.yml` に Actions の自動更新設定が追加されている（オプション）
- [ ] `ci.yml` と `deploy.yml` にワークフローレベルの最小 `permissions` が宣言されている

## 関連ファイル

- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`
- `.github/dependabot.yml`（新規作成）
