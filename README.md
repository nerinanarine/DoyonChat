# DoyonChat

生成 AI（OpenCode Go）と対話できるチャット Web アプリ。複数の AI モデルを切り替えながら、ストリーミング応答でリアルタイムに会話できます。

## 主な機能

- 💬 **テキストチャット** — 複数の AI モデルと自然な対話
- ⚡ **ストリーミング応答** — AI の回答がリアルタイムに文字単位で表示される
- 🔄 **モデル切り替え** — OpenCode Go公式Endpoints表の26モデルを会話ごとに選択
- 🖼️ **画像入力** — ファイル選択・ドラッグ＆ドロップ・プレビュー・5MB上限検証
- 🧠 **Reasoning表示** — モデルの思考過程と最終回答を分けて表示
- 📂 **複数会話管理** — サイドバーで会話の作成・切り替え・リネーム・削除
- ⚙️ **ユーザー設定** — 既定モデルをアカウントに保存し、別デバイスでも復元。設定メニューからログアウトも可能
- 📲 **PWA対応** — Android / iPhoneのホーム画面に追加してスタンドアロン起動、オフラインでアプリシェルを表示
- 🏷️ **タイトル自動生成** — 最初のメッセージから AI が会話タイトルを要約（手動リネーム優先）
- 🔐 **Entra ID認証** — Microsoftアカウントでログインし、ユーザーごとに会話を分離
- 📝 **Markdown レンダリング** — コードブロックにはシンタックスハイライトとコピーボタン付き
- 📱 **レスポンシブデザイン** — デスクトップ・タブレット・モバイル対応
- ⏹️ **ストリーミング停止と中間保存** — 生成中の応答を中断し、受信済みの内容を保存・復元（P1-003）
- ⚠️ **エラー表示と再試行** — レート制限・タイムアウト・認証失敗などを日本語で表示し、再試行可能（P2-003）
- ⏳ **ローディング表示** — 初期データ取得中と会話メッセージ取得中をアクセシブルに表示（P2-013）

## 技術スタック

### フロントエンド

| 技術 | 用途 |
|------|------|
| React 18 | UI フレームワーク |
| TypeScript | 型安全な開発 |
| Vite 5 | ビルドツール |
| Tailwind CSS | スタイリング |
| react-markdown | Markdown レンダリング |
| react-syntax-highlighter | コードブロックのシンタックスハイライト |
| lucide-react | アイコン |

### バックエンド

| 技術 | 用途 |
|------|------|
| Node.js 20 + Azure Functions v4 | API サーバー（Flex Consumption） |
| TypeScript | 型安全な開発 |
| @azure/functions | HTTPトリガー・HTTP Streams |
| @azure/cosmos | CosmosDB 接続 |

### インフラストラクチャ

| サービス | 用途 |
|---------|------|
| Azure Static Web Apps | フロントエンドホスティング |
| Azure Functions Flex Consumption（Linux） | バックエンドホスティング |
| Azure CosmosDB | 会話・メッセージ・ユーザー設定の永続化 |
| Bicep | IaC（インフラ構成のコード化） |

### 外部 API

| API | 用途 |
|-----|------|
| OpenCode Go API | AI モデルへのリクエスト（Responses / Chat Completions / Messages SSE） |

## ディレクトリ構成

```
.
├── frontend/           # React + Vite フロントエンド
│   ├── src/
│   │   ├── components/   # UI コンポーネント
│   │   ├── hooks/        # カスタム React Hooks
│   │   ├── services/     # API クライアント
│   │   └── types/        # TypeScript 型定義
│   └── package.json
│
├── functions/          # Azure Functions v4 + TypeScript バックエンド
│   ├── src/functions/     # HTTPトリガー
│   ├── src/services/     # ビジネスロジック
│   ├── tests/            # Functionsテスト
│   └── package.json
│
├── infra/              # Azure Bicep IaC
│   ├── modules/          # 各リソースの Bicep モジュール
│   ├── parameters/       # 環境別パラメーター
│   └── scripts/          # デプロイスクリプト
│
├── specs/              # 仕様書・設計書
│   ├── 000_backlog/      # バックログと対応履歴
│   ├── 001-chat-app/     # Phase 1（MVP）仕様
│   ├── 005-entra-id-auth/           # Entra ID認証
│   ├── 006-user-isolation-functions/ # ユーザー分離・Functions移行
│   ├── 007-reasoning-display/        # Reasoning表示
│   ├── 008-rename-conversation/      # 会話の手動リネーム
│   ├── 009-opencode-go-models/       # OpenCode Goモデル更新
│   ├── P1-003/           # ストリーミング中断時の中間保存
│   ├── P1-004/           # 会話タイトルの自動生成
│   ├── P2-003/           # APIエラー時の表示
│   ├── P2-008/           # ユーザー設定
│   ├── P2-013/           # ローディング表示
│   └── P3-011/           # PWA対応
│
└── .github/workflows/  # GitHub Actions CI/CD
```

## クイックスタート

### 必要条件

- Node.js 20+
- npm 10+
- Azure Functions Core Tools v4
- Azure CosmosDB アカウント（または CosmosDB Emulator）
- OpenCode Go API キー

### 1. リポジトリのクローン

```bash
git clone https://github.com/nerinanarine/DoyonChat.git
cd DoyonChat
```

### 2. Functions バックエンドのセットアップ

```bash
cd functions
npm install
cp local.settings.json.example local.settings.json
npm run build
func start
```

Functionsは http://localhost:7071 で起動します。`local.settings.json` の `AUTH_ENABLED=false` では認証なしの `dev-user` モードで動作します。

### 3. フロントエンドのセットアップ

```bash
cd ../frontend
npm install

# 環境変数の設定
cp .env.example .env
# .env を編集して:
#   VITE_API_URL=http://localhost:7071/api

# 開発サーバー起動
npm run dev
```

フロントエンドは http://localhost:5173、Functionsバックエンドは http://localhost:7071 で起動します。

## デプロイ

詳細なFunctions移行・セットアップ手順は [specs/006-user-isolation-functions/setup-guide.md](specs/006-user-isolation-functions/setup-guide.md) を参照してください。MVPの初期手順は履歴資料のため、現行環境のセットアップには使用しないでください。

### 簡易デプロイ（Bash）

```bash
# Functions バックエンド（Flex Consumption / One Deploy用パッケージ）
cd functions
npm ci
npm run build
npm prune --omit=dev
zip -r functions-deploy.zip host.json package.json package-lock.json dist node_modules
# GitHub Actionsでは Azure/functions-action@v1 でデプロイします

# 旧App Serviceの手動デプロイ手順は移行完了により廃止しました。

# フロントエンド
cd ../frontend
VITE_API_URL="https://<api-url>/api" npm run build
npx @azure/static-web-apps-cli deploy ./dist --env production --deployment-token "<token>"
```

## CI/CD

本プロジェクトは GitHub Actions を使用した CI/CD パイプラインを備えています。

### ワークフロー

| ワークフロー | トリガー | 内容 |
|-------------|---------|------|
| `ci.yml` | PR（opened, synchronize, reopened） | Functionsテスト、インフラ検証 |
| `deploy.yml` | main ブランチへの push / `workflow_dispatch` | テスト → インフラ → Functions → フロントエンドの自動デプロイ |

### CI ステータス

[![CI](https://github.com/nerinanarine/DoyonChat/actions/workflows/ci.yml/badge.svg)](https://github.com/nerinanarine/DoyonChat/actions/workflows/ci.yml)
[![Deploy](https://github.com/nerinanarine/DoyonChat/actions/workflows/deploy.yml/badge.svg)](https://github.com/nerinanarine/DoyonChat/actions/workflows/deploy.yml)

### 必要な GitHub Secrets

| Secret | 説明 |
|--------|------|
| `AZURE_CLIENT_ID` | Azure SP クライアント (App) ID（OIDC Federated Credentials） |
| `AZURE_TENANT_ID` | Azure AD テナント ID（OIDC Federated Credentials） |
| `AZURE_SUBSCRIPTION_ID` | Azure サブスクリプション ID |
| `AZURE_RESOURCE_GROUP` | デプロイ先のリソースグループ名 |
| `OPENCODE_GO_API_KEY` | OpenCode Go API キー |
| `COSMOSDB_KEY` | CosmosDB アクセスキー |
| `SWA_DEPLOYMENT_TOKEN` | Azure Static Web Apps のデプロイトークン |

### 必要な GitHub Variables

| Variable | 説明 |
|----------|------|
| `AUTH_ENABLED` | Entra ID認証の有効化（`true` / `false`） |
| `ENTRA_TENANT_ID` | Entra IDテナントID |
| `ENTRA_API_CLIENT_ID` | APIアプリ登録のクライアントID |
| `ENTRA_CLIENT_ID` | SPAアプリ登録のクライアントID |

Function App名、API URL、Static Web App URLはBicepのdeployment outputsから取得します。

### セットアップ手順

詳細なセットアップ手順は [specs/003-setup-ci-cd-pipeline/setup-guide.md](specs/003-setup-ci-cd-pipeline/setup-guide.md) を参照してください。

## 対応モデル

| Protocol | モデル | マルチモーダル | 備考 |
|----------|--------|-------------|------|
| Responses | `grok-4.6` | ❌ | OpenCode Go model |
| Responses | `gpt-5.6-luna` | ❌ | 一般推論・コーディング |
| Chat Completions | `glm-5.3-flash` | ❌ | OpenCode Go model |
| Chat Completions | `glm-5.3` | ❌ | OpenCode Go model |
| Chat Completions | `glm-5.2` | ✅ | 高品質、画像入力対応 |
| Chat Completions | `glm-5.1` | ✅ | 高品質、画像入力対応 |
| Chat Completions | `kimi-k3` | ❌ | 高度な推論・コーディング |
| Chat Completions | `kimi-k2.7-code` | ❌ | コーディング特化 |
| Chat Completions | `kimi-k2.6` | ❌ | 高品質、長文対応（既定モデル） |
| Chat Completions | `longcat-2.0` | ❌ | OpenCode Go model |
| Chat Completions | `deepseek-v4-pro` | ❌ | エージェント・コーディング |
| Chat Completions | `deepseek-v4-flash` | ❌ | 高速処理・大量処理 |
| Chat Completions | `deepseek-v4-flash-vision-exp` | ✅ | 画像入力対応の実験モデル |
| Chat Completions | `mimo-v2.5` | ❌ | 高速・大量処理 |
| Chat Completions | `mimo-v2.5-pro` | ❌ | 高品質、汎用タスク |
| Messages | `minimax-m3` | ❌ | 長文・汎用タスク |
| Messages | `minimax-m2.7` | ❌ | 品質とコストのバランス |
| Messages | `minimax-m2.5` | ❌ | OpenCode Go model |
| Responses | `muse-spark-1.2-contributor` | ❌ | 地域制限・学習利用に関する公式注意あり |
| Messages | `qwen3.8-max` | ❌ | 高品質、汎用タスク |
| Messages | `qwen3.8-flash` | ❌ | OpenCode Go model |
| Messages | `qwen3.7-max` | ❌ | 高品質、汎用タスク |
| Messages | `qwen3.7-plus` | ❌ | 汎用コーディング |
| Messages | `qwen3.6-plus` | ❌ | 汎用タスク |
| Chat Completions | `hy4-preview` | ❌ | OpenCode Go model |
| Chat Completions | `hy3` | ❌ | 実験的モデル |

> モデルID・protocol・提供状況は [OpenCode Go公式Endpoints表](https://opencode.ai/docs/go/)（2026-08-31確認）を基準にしています。提供モデルは変更される可能性があります。
>
> **注意:** 画像入力UIは利用できますが、Messagesモデルへの新規画像送信は非対応のため、送信前に別protocolの画像対応モデルを選択してください。

### 全26モデルの実API確認

`functions/local.settings.json`の`Values.OPENCODE_GO_API_KEY`へ実キーを設定し、明示的に次を実行します。

```bash
cd functions
npm run test:live:models
```

このコマンドは26モデルを直列に各1回、512 tokens上限・120秒timeout・retryなしで呼びます。通常の`npm test`やCIからは実行されません。APIキー、リクエスト・回答本文、上流エラー本文はログへ出力しません。

## バックログ（未実装機能）

未実装機能・改善項目は [specs/000_backlog/backlog.md](specs/000_backlog/backlog.md) で管理しています。

主な未対応項目:

- **P1** マルチモーダル非対応モデル警告、DoyonHub・管理機能（P1-003は実装済み・手動確認待ち、P1-011は未対応）
- **P2** コンテキスト長警告、複数タブ同期、CI/CDクリーンアップ、Playwright E2E、生成モデル名・生成時間表示（P2-003/P2-013は実装済み・手動確認待ち）
- **P3** ダークモード、検索、エクスポート、キーボードショートカット、アクセシビリティ、仮想スクロール、テスト強化
- **P4** プロンプトテンプレート、コード実行、音声入力、会話共有

## ライセンス

MIT
