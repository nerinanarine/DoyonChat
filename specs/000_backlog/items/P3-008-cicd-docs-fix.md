# P3-008: CI/CD 関連ドキュメントの誤記修正

## 概要

spec.md と setup-guide.md に CI/CD 関連の誤記・不正確な記述が残っている。

## 詳細

### 問題1: spec.md FR-003 の「ステージング」表記
前提は「個人プロジェクトのため本番環境のみ」だが、FR-003 だけ「ステージング環境への自動デプロイ」と書かれている。計画・実装は正しく本番デプロイ。
→ FR-003 を「本番環境への自動デプロイ」に修正。

### 問題2: setup-guide の手動実行指示が不正確
`ci.yml` には `workflow_dispatch` トリガーがないのに、setup-guide の手順3.1は「Actions タブから Run workflow」や `gh workflow run ci.yml` を指示している。
→ ガイドの検証手順を「PR を作成して CI を起動する」に修正。

## 受け入れ条件

- [ ] `specs/003-setup-ci-cd-pipeline/spec.md` の FR-003 が「本番環境」に修正されている
- [ ] `specs/003-setup-ci-cd-pipeline/setup-guide.md` の手順3.1が PR ベースの検証に修正されている

## 関連ファイル

- `specs/003-setup-ci-cd-pipeline/spec.md`
- `specs/003-setup-ci-cd-pipeline/setup-guide.md`
