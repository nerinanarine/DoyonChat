# Feature Specification: CI/CD Pipeline Setup

**Feature Branch**: `[003-setup-ci-cd-pipeline]`

**Created**: 2026-06-28

**Status**: Draft

**Input**: User description: "CICDのセットアップ。GitHub Actionsでバックエンドのビルド・テスト、インフラの検証、PR時の自動チェック、mainブランチへのマージ時のデプロイフローを構築する。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pull Request時の自動テスト (Priority: P1)

開発者がFeatureブランチからmainブランチへのPull Requestを作成すると、GitHub Actionsが自動的にトリガーされ、バックエンドのビルドとユニットテストが実行される。テスト失敗時はPRにチェック失敗のステータスが付き、マージがブロックされる。

**Why this priority**: コード品質を自動的に担保し、mainブランチへのデグレを防ぐための最も基本的なCI機能。

**Independent Test**: 任意のFeatureブランチで意図的にテストを失敗させたPRを作成し、GitHub Actionsが失敗ステータスを報告することを確認できる。

**Acceptance Scenarios**:

1. **Given** 開発者がFeatureブランチでコード変更をプッシュした状態、**When** mainブランチへのPull Requestを作成する、**Then** GitHub Actionsワークフローが自動的に起動する
2. **Given** PRが作成された状態、**When** GitHub Actionsが実行される、**Then** `npm ci`、ビルド、`npm test`が順次実行される
3. **Given** テストが失敗した状態、**When** GitHub Actionsの実行が完了する、**Then** PRに失敗ステータスが表示され、マージボタンが無効化される
4. **Given** テストが成功した状態、**When** GitHub Actionsの実行が完了する、**Then** PRに成功ステータスが表示され、マージが可能になる

---

### User Story 2 - インフラテンプレートの検証 (Priority: P1)

Pull Request時に、Azure Bicep/ARMテンプレート（`infra/`ディレクトリ配下）の構文検証と`what-if`デプロイ検証が自動実行される。インフラの変更が正しくない場合はPRがブロックされる。

**Why this priority**: インフラ変更の誤りを本番デプロイ前に検出し、コストのかかるデプロイ失敗を防ぐ。

**Independent Test**: Bicepファイルに構文エラーを含めたPRを作成し、検証ワークフローが失敗することを確認できる。

**Acceptance Scenarios**:

1. **Given** `infra/`ディレクトリのファイルが変更されたPRが作成された状態、**When** GitHub Actionsが実行される、**Then** Bicepファイルの構文検証（`bicep build`または`az deployment group validate`）が実行される
2. **Given** Bicepテンプレートに構文エラーがある状態、**When** 検証ワークフローが実行される、**Then** エラーが検出され、PRに失敗ステータスが表示される
3. **Given** Bicepテンプレートが正しい状態、**When** 検証ワークフローが実行される、**Then** 検証が成功し、PRに成功ステータスが表示される

---

### User Story 3 - mainブランチマージ時の自動デプロイ (Priority: P2)

mainブランチにコードがマージされると、GitHub Actionsが自動的に本番環境へバックエンドをビルド・デプロイする。デプロイ完了後、GitHubのChecks欄に結果が表示される。

**Why this priority**: リリースプロセスを自動化し、手動デプロイのミスを減らす。個人プロジェクトのためステージング環境は持たず、本番環境に直接デプロイする。

**Independent Test**: mainブランチにダミーの変更をマージし（または手動トリガーで）、デプロイワークフローが正しく実行されることを確認できる。

**Acceptance Scenarios**:

1. **Given** PRがレビュー済みでマージ可能な状態、**When** 開発者がマージボタンをクリックする、**Then** mainブランチへのマージ後、デプロイワークフローが自動的に起動する
2. **Given** デプロイワークフローが実行中の状態、**When** 各ステップが完了する、**Then** バックエンドのビルド、Azureへのデプロイが順次実行される
3. **Given** デプロイが完了した状態、**When** ワークフローが終了する、**Then** 成功/失敗の結果がGitHubのChecks欄に表示される

---

### User Story 4 - 手動トリガーによるワークフロー実行 (Priority: P2)

開発者はGitHubのUIから手動でワークフローをトリガーでき、特定のブランチや環境に対してデプロイやテストを実行できる。これにより、緊急時の手動デプロイや、特定ブランチの検証が可能になる。

**Why this priority**: 自動トリガーだけでは対応できない緊急時や検証シナリオに備えるため。

**Independent Test**: GitHub Actionsの「Run workflow」ボタンから手動でワークフローを起動し、正しく実行されることを確認できる。

**Acceptance Scenarios**:

1. **Given** 開発者がGitHubリポジトリのActionsタブを開いた状態、**When** 手動実行可能なワークフローを選択して「Run workflow」をクリックする、**Then** ワークフローが指定したブランチで実行される
2. **Given** 手動トリガーが実行された状態、**When** ワークフローが完了する、**Then** 実行結果がActions履歴に記録される

---

### User Story 5 - 依存関係のキャッシュによる高速化 (Priority: P2)

GitHub Actionsワークフローで`npm ci`の実行時に、`node_modules`とnpmキャッシュを適切にキャッシュすることで、CI実行時間を短縮する。

**Why this priority**: CIの実行時間は開発者の生産性に直結。キャッシュがない場合、毎回npmパッケージをダウンロードするため時間がかかる。

**Independent Test**: 同一のPRに対して2回目以降のCI実行で、`npm ci`の実行時間が短縮されていることを確認できる。

**Acceptance Scenarios**:

1. **Given** キャッシュが存在しない初回実行の状態、**When** `npm ci`が実行される、**Then** 依存関係がフルインストールされ、キャッシュが保存される
2. **Given** キャッシュが存在する2回目以降の実行の状態、**When** `npm ci`が実行される、**Then** キャッシュから依存関係が復元され、インストール時間が短縮される

## Edge Cases

- **ワークフロー実行の同時制御**: 同一ブランチに対する複数のPushやPR更新があった場合、古いワークフローをキャンセルし最新のもののみ実行する（concurrency設定）
- **機密情報の漏洩防止**: Azure認証情報やAPIキーはGitHub Secretsで管理し、ワークフローログに露出しないようにする
- **依存関係の脆弱性スキャン**: `npm audit`を定期的に実行し、Critical/Highの脆弱性があればアラートを出す（オプション）
- **インフラ変更のみのPR**: バックエンドコードに変更がない場合、バックエンドのビルド・テストはスキップし、インフラ検証のみ実行する（パスフィルタ設定）
- **ワークフロー失敗時の再実行**: 一時的なネットワークエラー等で失敗した場合、開発者が手動で再実行できる

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: PR作成時に、バックエンドのビルドとユニットテストが自動実行される
- **FR-002**: PR作成時に、`infra/`配下のBicep/ARMテンプレートの構文検証が実行される
- **FR-003**: mainブランチへのマージ時に、ステージング環境への自動デプロイが実行される
- **FR-004**: ワークフローは手動トリガー（`workflow_dispatch`）に対応する
- **FR-005**: `npm ci`の依存関係キャッシュが有効に設定される
- **FR-006**: ワークフロー実行時に、同一ブランチの古い実行を自動キャンセルする（concurrency制御）
- **FR-007**: Azure認証情報はGitHub Secretsで管理し、ワークフローに安全に渡す
- **FR-008**: ワークフローの各ステップに適切な名前を付け、ログが読みやすいようにする
- **FR-009**: バックエンドコードに変更がないPRでは、バックエンドのテストをスキップする（パスフィルタ）
- **FR-010**: インフラに変更がないPRでは、インフラ検証をスキップする（パスフィルタ）

### Key Entities

- **Workflow（ワークフロー）**: GitHub Actionsの定義ファイル（`.github/workflows/*.yml`）。トリガー条件、ジョブ、ステップを定義する
- **Job（ジョブ）**: ワークフロー内の処理単位。複数のジョブを並列/直列実行できる
- **Step（ステップ）**: ジョブ内の個別の処理。シェルコマンドまたはアクションの実行
- **Secret（シークレット）**: GitHubリポジトリに保存された機密情報。ワークフローから参照可能
- **Action（アクション）**: GitHub Marketplaceやリポジトリ内で定義された再利用可能な処理単位

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: PR作成からテスト完了までのCI実行時間が5分以内（キャッシュヒット時）
- **SC-002**: `npm ci`の実行時間がキャッシュありで30秒以内、キャッシュなしで3分以内
- **SC-003**: ワークフローの設定変更（`.github/workflows/`の変更）を除き、mainブランチへの直接プッシュが禁止されている（ブランチ保護ルール）
- **SC-004**: PRマージ前に、必ずCIチェックが成功していることが必須になっている（ブランチ保護ルール）
- **SC-005**: ワークフロー定義ファイルが3つ以下に整理されている（PRテスト、インフラ検証、デプロイ）
- **SC-006**: ワークフローのYAML構文が`actionlint`または同等のツールで検証済み

## Assumptions

- GitHubリポジトリに対してActionsの実行が有効になっている
- AzureサブスクリプションとService Principalが既に作成済みで、GitHub Secretsに登録可能
- バックエンドはNode.js 20.x（LTS）で動作する
- AzureデプロイはWeb App（App Service）とStatic Web Appsを使用する
- 個人プロジェクトのためステージング環境は持たず、本番環境のみを対象とする
- `npm test`は既存のJest設定で実行可能である
