# DoyonChat

生成 AI（OpenCode Go）と対話できるチャット Web アプリ。複数の AI モデルを切り替えながら、ストリーミング応答でリアルタイムに会話できます。

## デプロイ済み環境

| 環境 | URL | 状態 |
|------|-----|------|
| フロントエンド | https://mango-river-085453200.7.azurestaticapps.net | 🟢 稼働中 |
| バックエンド API | https://api-dev-tk7g56gremuuy.azurewebsites.net | 🟢 稼働中 |

## 主な機能

- 💬 **テキストチャット** — 複数の AI モデルと自然な対話
- ⚡ **ストリーミング応答** — AI の回答がリアルタイムに文字単位で表示される
- 🔄 **モデル切り替え** — 会話ごとにモデルを変更（Kimi, GLM, DeepSeek, Qwen, MiniMax, MiMo, Hy3 など）
- 📂 **複数会話管理** — サイドバーで会話の作成・切り替え・削除
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
| Node.js 20 + Express | API サーバー |
| TypeScript | 型安全な開発 |
| esbuild | バンドル（`--packages=external`） |
| @azure/cosmos | CosmosDB 接続 |

### インフラストラクチャ

| サービス | 用途 |
|---------|------|
| Azure Static Web Apps | フロントエンドホスティング |
| Azure App Service（Linux） | バックエンドホスティング |
| Azure CosmosDB | 会話・メッセージの永続化 |
| Bicep | IaC（インフラ構成のコード化） |

### 外部 API

| API | 用途 |
|-----|------|
| OpenCode Go API | AI モデルへのリクエスト（OpenAI 互換 Chat Completions） |

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
├── backend/            # Express + TypeScript バックエンド
│   ├── src/
│   │   ├── routes/       # API エンドポイント
│   │   ├── services/     # ビジネスロジック
│   │   ├── db/           # CosmosDB 接続
│   │   └── types/        # TypeScript 型定義
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
│   └── 002-chat-app-phase2/  # Phase 2 仕様
│
└── .github/workflows/  # GitHub Actions CI/CD
```

## クイックスタート

### 必要条件

- Node.js 20+
- npm 10+
- Azure CosmosDB アカウント（または CosmosDB Emulator）
- OpenCode Go API キー

### 1. リポジトリのクローン

```bash
git clone https://github.com/nerinanarine/DoyonChat.git
cd DoyonChat
```

### 2. バックエンドのセットアップ

```bash
cd backend
npm install

# 環境変数の設定
cp .env.example .env
# .env を編集して以下を設定:
#   PORT=3000
#   COSMOSDB_ENDPOINT=...
#   COSMOSDB_KEY=...
#   COSMOSDB_DATABASE=chatdb
#   OPENCODE_GO_API_KEY=sk-...
#   FRONTEND_URL=http://localhost:5173

# 開発サーバー起動
npm run dev
```

### 3. フロントエンドのセットアップ

```bash
cd ../frontend
npm install

# 環境変数の設定
cp .env.example .env
# .env を編集して:
#   VITE_API_URL=http://localhost:3000/api

# 開発サーバー起動
npm run dev
```

フロントエンドは http://localhost:5173 で、バックエンドは http://localhost:3000 で起動します。

## デプロイ

詳細なデプロイ手順は [specs/001-chat-app/quickstart.ja.md](specs/001-chat-app/quickstart.ja.md) を参照してください。

### 簡易デプロイ（Bash）

```bash
# バックエンド
cd backend && npm run build
python3 -c "
import zipfile, os
with zipfile.ZipFile('deploy.zip', 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk('dist'):
        for f in files: zf.write(os.path.join(root, f), os.path.join(root, f).replace('\\\\', '/'))
    for root, dirs, files in os.walk('node_modules'):
        for f in files:
            fp = os.path.join(root, f)
            if os.path.isfile(fp): zf.write(fp, fp.replace('\\\\', '/'))
    zf.write('package.json', 'package.json')
"
az webapp deploy --resource-group <rg-name> --name <app-name> --src-path deploy.zip --type zip

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
| `ci.yml` | PR（opened, synchronize, reopened） | バックエンドのテスト (`npm test`)、インフラ検証 (`bicep build` + `validate`) |
| `deploy.yml` | main ブランチへの push / `workflow_dispatch` | テスト → インフラデプロイ → バックエンド + フロントエンドの自動デプロイ |

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
| `AZURE_LOCATION` | Azure リージョン（例: `japaneast`） |
| `APP_SERVICE_NAME` | App Service 名 |
| `STATIC_WEB_APP_NAME` | Static Web App 名 |

### セットアップ手順

詳細なセットアップ手順は [specs/003-setup-ci-cd-pipeline/setup-guide.md](specs/003-setup-ci-cd-pipeline/setup-guide.md) を参照してください。

## 対応モデル

| モデル | マルチモーダル | 備考 |
|--------|-------------|------|
| `kimi-k2.6` | ❌ | 高品質、長文対応 |
| `kimi-k2.7-code` | ❌ | コーディング特化 |
| `glm-5.2` | ✅ | 高品質、画像入力対応 |
| `glm-5.1` | ✅ | 高品質、画像入力対応 |
| `deepseek-v4-pro` | ❌ | 推論能力重視 |
| `qwen3.7-max` | ❌ | バランス型 |
| `minimax-m3` | ❌ | 日本語対応良好 |
| `mimo-v2.5-pro` | ❌ | 高速応答 |
| `mimo-v2.5` | ❌ | 高速応答 |
| `hy3-preview` | ❌ | 実験的モデル |

> **注意:** マルチモーダル（画像入力）は現在フロントエンド未実装です。対応予定は [バックログ](specs/000_backlog/backlog.md) を参照。

## バックログ（未実装機能）

未実装機能・改善項目は [specs/000_backlog/backlog.md](specs/000_backlog/backlog.md) で管理しています。

主な項目:

- **P1** 画像アップロード UI、マルチモーダル警告、ストリーミング中断保存、自動タイトル生成、**Reasoning 表示改善**、Entra ID 認証、ユーザー分離
- **P2** コンテキスト長警告、複数タブ同期、エラー UX 改善、Azure Functions 移行
- **P3** ダークモード、検索、エクスポート、キーボードショートカット、アクセシビリティ、仮想スクロール、テスト強化
- **P4** PWA、プロンプトテンプレート、コード実行、音声入力、会話共有

## ライセンス

MIT
