# Implementation Plan: PWA対応（AndroidとiPhone両方）

**Branch**: `feat/011-pwa-android-ios` | **Date**: 2026-08-23 | **Spec**: [spec.md](./spec.md) | **Backlog**: [P3-011](../../specs/000_backlog/items/P3-011-pwa-android-ios.md)

**Input**: [Feature specification](./spec.md) / Backlog P3-011

## Summary

`vite-plugin-pwa` を導入し、Android Chrome と iPhone Safari の両方でホーム画面追加→standalone起動できる PWA を提供する。Manifest は `DoyonChat / standalone / #0f172a / #f9fafb` と 192/512/maskable/180 のアイコン（提供画像から生成）、iOSメタタグと `viewport-fit=cover` + `safe-area-inset` 対応を行う。Service Worker は本番のみでアプリシェルを precache し、`/api/*` と認証情報はキャッシュしない（NetworkOnly）。オフラインではシェルとキャッシュ済み会話の閲覧、オンライン復帰で最新へ更新する。

## Technical Context

**Runtime**: Node.js 20, Vite 5

**Frontend**: React 18, TypeScript, Tailwind CSS, Vitest, Playwright

**Backend**: Azure Functions (`functions/`) — 本機能では変更しない

**PWA Library**: `vite-plugin-pwa`（`generateSW` + Workbox）

**Manifest 提供**: Vite 設定内の `VitePWA({ manifest: {...} })` で生成（`frontend/public/manifest.json` の手動管理は行わない）

**Service Worker**: `generateSW`, `registerType: autoUpdate`, `workbox.globPatterns`, `navigateFallback` 等。`workbox.runtimeCaching` で `/api/*` を `NetworkOnly` 明示。

**Icons**: `frontend/public/icons/` 配下 — 提供画像 1024x1024 から Pillow で生成済み: `icon-192x192.png`, `icon-512x512.png`, `icon-512x512-maskable.png`, `apple-touch-icon.png`

**Constraints**:

- 開発ビルドでは SW 登録しない
- API レスポンスと認証トークンを SW キャッシュしない（ユーザー分離担保）
- 既存の Entra ID 認証フロー、会話APIの仕様を変更しない
- `frontend/public` は本機能で新設
- 対象外: ストア登録、Push通知、オフライン送信キュー、無制限オフライン保存

## Design Decisions

### D1. vite-plugin-pwa の generateSW を採用する

`injectManifest` ではなく `generateSW` を採用し、precache と runtimeCaching を宣言的に設定する。カスタムSWロジックは今回不要。

```ts
VitePWA({
  registerType: 'autoUpdate',
  includeAssets: ['icons/*.png'],
  manifest: { ... },
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
    navigateFallback: 'index.html',
    runtimeCaching: [
      { urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' }
    ]
  },
  devOptions: { enabled: false }
})
```

### D2. Manifest を Vite 設定で生成し、手動 manifest.json を置かない

`frontend/public/manifest.json` を手動で置くと VitePWA の生成と二重管理になるため、Vite設定内の `manifest` オプションで一元管理する。`manifest.webmanifest` はビルド成果物として自動出力される。

### D3. アイコンは提供画像からビルド時に生成済みをコミットする

`copilot_image_1787094399152.jpeg`（実体PNG 1024）は `frontend/public/icons/source-*.png` として保持し、Pillow で 192/512/180 を生成してリポジトリにコミットする。ビルド時に動的生成せず、成果物が確定するようにする。maskable は 512 に白パディングを付けた派生を `purpose: maskable` で登録する。

### D4. SW キャッシュはシェルのみ、API は NetworkOnly

`workbox.runtimeCaching` で `/api/` を `NetworkOnly` に固定し、認証ヘッダー付きリクエストが Cache Storage に残らないようにする。会話データのオフライン閲覧は「直近取得済みのメモリ/ローカル状態が残っていれば閲覧できる」範囲に留め、Cache API への永続化は行わない。ユーザー分離リスクを最小化する。

### D5. iOS 対応は meta タグと CSS の両方で行う

`index.html` に `apple-mobile-web-app-capable=yes`, `apple-mobile-web-app-status-bar-style=default`, `apple-mobile-web-app-title`, `apple-touch-icon` を追加。`viewport` に `viewport-fit=cover` を追加。`index.css` で `padding-top: env(safe-area-inset-top)` 等を AppLayout のヘッダー/入力領域に適用する。

### D6. 開発/本番の切り替えは devOptions.enabled=false で担保する

`vite dev` では SW を登録せず、`vite build` 成果物でのみ登録されることを自動テストで検証する。

## Target Project Structure

```text
frontend/
├── public/
│   └── icons/
│       ├── icon-192x192.png
│       ├── icon-512x512.png
│       ├── icon-512x512-maskable.png
│       ├── apple-touch-icon.png
│       ├── source-1024x1024.png
│       └── source-original.jpeg
├── index.html                    # iOS meta + viewport-fit + manifest linkはVitePWAが注入
├── vite.config.ts                # VitePWA plugin追加
├── src/
│   ├── index.css                 # safe-area対応
│   └── main.tsx                  # 変更なし（VitePWAが登録コードを注入）
└── tests/unit/pwa.test.ts        # 新規: manifest/SW設定のunit test

specs/P3-011/
├── spec.md
└── plan.md
```

## Implementation Phases

### Phase 0: 事前準備（本plan）

**Tasks**:

- [x] `feat/011-pwa-android-ios` ブランチ作成（main 151128f から）
- [x] `specs/P3-011/spec.md` 作成（提案どおりで合意）
- [x] 提供画像から 192/512/maskable/180 を生成し `frontend/public/icons/` へ配置
- [x] `specs/000_backlog/backlog.md` と `P3-011` item のステータスを 🔴→🟡 に更新（本commitで実施）
- [x] `copilot_image_1787094399152.jpeg`（ルート）を削除（icons 配下へ移動済みのため）

**Verification**:

- [x] `frontend/public/icons/` に 4種のPNGが存在する
- [x] `spec.md` がバックログ受け入れ条件 10項目をカバーしている

### Phase 1: vite-plugin-pwa 導入と Manifest

**Files**:

- `frontend/package.json`
- `frontend/vite.config.ts`
- `frontend/public/icons/*`（Phase 0 で配置済み）

**Tasks**:

- [ ] `vite-plugin-pwa` を devDependency へ追加
- [ ] `vite.config.ts` に `VitePWA({ registerType: autoUpdate, includeAssets, manifest, workbox })` を追加
- [ ] Manifest に `name: DoyonChat`, `short_name: DoyonChat`, `display: standalone`, `start_url: /`, `scope: /`, `theme_color: #0f172a`, `background_color: #f9fafb`, `description`, `icons`（192 any, 512 any, 512 maskable → spec FR-004準拠）を設定
- [ ] `workbox.globPatterns` と `navigateFallback`、`runtimeCaching`（`/api/*` → NetworkOnly）を設定
- [ ] `devOptions.enabled = false` を設定

**Verification**:

- [ ] `npm run build` で `dist/manifest.webmanifest` と `dist/sw.js`（または `workbox-*.js`）が生成される
- [ ] `dist/index.html` に manifest リンクと SW 登録コードが含まれる
- [ ] Manifest JSON に上記必須項目が含まれる

### Phase 2: iOS meta タグと safe area 対応

**Files**:

- `frontend/index.html`
- `frontend/src/index.css`（または `AppLayout.tsx` のクラス）

**Tasks**:

- [ ] `index.html` の `viewport` に `viewport-fit=cover` を追加
- [ ] `index.html` に `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`, `apple-touch-icon`（`/icons/apple-touch-icon.png`）を追加
- [ ] `theme-color` meta を `#0f172a` で追加
- [ ] `index.css` で `env(safe-area-inset-top/bottom/left/right)` を用いた padding 調整を追加（例: `body { padding-top: env(safe-area-inset-top) }` 等、AppLayout のヘッダー/入力欄に適用）

**Verification**:

- [ ] 本番ビルドの `dist/index.html` に上記 meta タグが含まれる
- [ ] iPhone viewport でヘッダー/入力欄がノッチ・ホームインジケーターに隠れない

### Phase 3: 自動テスト

**Files**:

- `frontend/tests/unit/pwa.test.ts`（新規）
- `frontend/tests/e2e/pwa.spec.ts`（任意、Playwright）

**Tasks**:

- [ ] Unit: `vite.config.ts` の PWA 設定を import して manifest 必須項目、icons 存在、workbox runtimeCaching に `/api/` が NetworkOnly であることを検証
- [ ] Unit: `index.html` に iOS meta と viewport-fit が含まれることを検証
- [ ] Unit: `frontend/public/icons/` の 192/512/180 が存在することを検証
- [ ] E2E (Playwright): 本番ビルドを `vite preview` で起動し、manifest リンクが取得できること、SW 登録が試みられることを検証
- [ ] E2E: iPhone/Android viewport でチャット入力・会話切替・スクロールが操作できることを検証

**Verification**:

- [ ] `npm test` が全緑
- [ ] `npm run build` が成功

### Phase 4: 手動検証とドキュメント同期

**Tasks**:

- [ ] `npm run build && npm run preview` で Lighthouse PWA 監査を実行し、インストール可能判定がパスすることを確認
- [ ] Android 実機 Chrome で「インストール」→ standalone 起動を確認
- [ ] iPhone 実機 Safari で「ホーム画面に追加」→ standalone 起動を確認
- [ ] DevTools Application パネルで precache と `/api/*` がキャッシュされていないことを確認
- [ ] オフライン化後にシェルとキャッシュ済み会話が表示され、オンライン復帰で最新へ更新されることを確認
- [ ] `specs/P3-011/spec.md` の Status を Implemented に更新し、実装メモを記載
- [ ] `specs/000_backlog/items/P3-011-pwa-android-ios.md` の変更履歴と `backlog.md` のステータスを 🟢 に更新（デプロイ後）

**Verification**:

- [ ] Lighthouse スコア（PWA カテゴリ）がパス
- [ ] 実機でのインストールと standalone 表示が成功
- [ ] `git diff --check` がクリーン

## Verification Commands

```bash
cd frontend
npm install
npm run build
npm test
npm run lint
npx playwright test  # e2e がある場合
```

## Test Strategy

### Frontend Unit Tests

- vite.config の PWA manifest 必須項目
- icons ファイル存在とサイズ
- workbox runtimeCaching の NetworkOnly 設定（`/api/`）
- index.html の iOS meta と viewport-fit

### Frontend E2E (Playwright)

- 本番ビルドの manifest 取得
- Android / iPhone viewport での操作性
- オフライン/オンライン切り替え時の表示

### Manual

- Lighthouse PWA 監査
- Android / iPhone 実機インストールと standalone 表示
- safe area、回転、キーボード表示

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| `/api/*` を誤ってキャッシュしユーザー間データが混在する | runtimeCaching を NetworkOnly に固定し、自動テストで検証する |
| iOS で standalone にならない | `apple-mobile-web-app-capable` と `display: standalone` の両方を設定し、実機で検証する |
| アイコンがインストール判定で失敗する | 192/512 を必須とし、manifest icons を unit test で検証する |
| SW が開発中にキャッシュしてデバッグ困難になる | `devOptions.enabled=false` にし、開発ビルドで登録されないことを検証する |
| maskable アイコンが欠けて警告される | 512 maskable を追加し、Lighthouse で警告がないことを確認する |
| safe area 未対応で入力欄が隠れる | `env(safe-area-inset-*)` を index.css で適用し、iPhone viewport で検証する |

## Deliverables

- [ ] `specs/P3-011/spec.md`
- [ ] `specs/P3-011/plan.md`
- [ ] `frontend/public/icons/` 一式
- [ ] PWA対応済み `vite.config.ts` と `index.html` / `index.css`
- [ ] 自動テスト（unit / e2e）
- [ ] Lighthouse と実機確認結果
- [ ] Backlog ステータス更新
