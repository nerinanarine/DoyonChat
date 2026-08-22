# DoyonChat

生成 AI（OpenCode Go）と対話できるチャット Web アプリ。複数の AI モデルを切り替えながら、ストリーミング応答でリアルタイムに会話できます。

## 主な機能

- 💬 **テキストチャット** — 複数の AI モデルと自然な対話
- ⚡ **ストリーミング応答** — AI の回答がリアルタイムに文字単位で表示される
- 🔄 **モデル切り替え** — 会話ごとにモデルを変更（Kimi, GLM, DeepSeek, Qwen, MiniMax, MiMo, Hy3 など）
- 📂 **複数会話管理** — サイドバーで会話の作成・切り替え・リネーム・削除
- 📝 **Markdown レンダリング** — コードブロックにはシンタックスハイライトとコピーボタン付き
- 📱 **レスポンシブデザイン** — デスクトップ・タブレット・モバイル対応
- ⏹️ **ストリーミング停止** — 生成中の応答を中断可能

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
| Azure CosmosDB | 会話・メッセージの永続化 |
| Bicep | IaC（インフラ構成のコード化） |

### 外部 API

| API | 用途 |
|-----|------|
| OpenCode Go API | AI モデルへのリクエスト（Chat Completions / Responses SSE） |

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
│   ├── 000_backlog/      # 未実装機能のバックログ
│   ├── 001-chat-app/     # Phase 1（MVP）仕様
│   ├── 006-user-isolation-functions/ # ユーザー分離・Functions移行
│   ├── 007-reasoning-display/        # Reasoning表示
│   └── 008-rename-conversation/      # 会話の手動リネーム
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

| モデル | マルチモーダル | 備考 |
|--------|-------------|------|
| `grok-4.5` | ❌ | 一般推論・汎用タスク |
| `gpt-5.6-luna` | ❌ | 一般推論・コーディング |
| `glm-5.2` | ✅ | 高品質、画像入力対応 |
| `glm-5.1` | ✅ | 高品質、画像入力対応 |
| `kimi-k3` | ❌ | 高度な推論・コーディング |
| `kimi-k2.7-code` | ❌ | コーディング特化 |
| `kimi-k2.6` | ❌ | 高品質、長文対応 |
| `mimo-v2.5` | ❌ | 高速・大量処理 |
| `mimo-v2.5-pro` | ❌ | 高品質、汎用タスク |
| `minimax-m3` | ❌ | 長文・汎用タスク |
| `minimax-m2.7` | ❌ | 品質とコストのバランス |
| `qwen3.8-max` | ❌ | 高品質、汎用タスク |
| `qwen3.7-max` | ❌ | 高品質、汎用タスク |
| `qwen3.7-plus` | ❌ | 汎用コーディング |
| `qwen3.6-plus` | ❌ | 汎用タスク |
| `deepseek-v4-pro` | ❌ | エージェント・コーディング |
| `deepseek-v4-flash` | ❌ | 高速処理・大量処理 |
| `hy3` | ❌ | 実験的モデル |

> モデルIDと提供状況は [OpenCode Go公式モデル一覧](https://opencode.ai/docs/go) を基準にしています。提供モデルは変更される可能性があります。
>
> **注意:** マルチモーダル（画像入力）は現在フロントエンド未実装です。対応予定は [バックログ](specs/000_backlog/backlog.md) を参照。

## バックログ（未実装機能）

未実装機能・改善項目は [specs/000_backlog/backlog.md](specs/000_backlog/backlog.md) で管理しています。

主な項目:

- **P1** 画像アップロード UI、マルチモーダル警告、ストリーミング中断保存、自動タイトル生成、**Reasoning 表示改善**、Entra ID 認証、ユーザー分離
- **P2** コンテキスト長警告、複数タブ同期、エラー UX 改善、Azure Functions 移行
- **P3** ダークモード、検索、エクスポート、キーボードショートカット、アクセシビリティ、仮想スクロール、テスト強化、**PWA（Android/iPhone）**
- **P4** プロンプトテンプレート、コード実行、音声入力、会話共有

## ライセンス

MIT
