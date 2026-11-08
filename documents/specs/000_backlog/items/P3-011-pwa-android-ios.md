# P3-011: PWA対応（AndroidとiPhone両方）

## 概要

DoyonChatをProgressive Web App（PWA）として提供し、AndroidとiPhoneの両方でホーム画面へ追加できるようにする。アプリシェルのキャッシュにより、ネットワークが一時的に利用できない場合でも、キャッシュ済みの画面や過去データを閲覧できるようにする。

## 背景・目的

- Android ChromeとiPhone Safariの両方で、ブラウザを開かずにDoyonChatへアクセスできるようにする
- モバイルブラウザでの再訪問を高速化する
- ネットワークが不安定な環境でも、キャッシュ済みの会話を閲覧できるようにする
- 既存のレスポンシブUIをインストール可能なWebアプリとして提供する

## 優先度

**P3（Low）**: 基本チャット機能・認証・Functions移行後の利便性向上として実装する。

## 受け入れ条件

1. Android ChromeでPWAのインストールまたは「ホーム画面に追加」が可能である
2. iPhone Safariで共有メニューから「ホーム画面に追加」が可能である
3. AndroidとiPhoneのホーム画面起動時に、ブラウザの通常タブではなくstandalone表示される
4. Web App Manifestにアプリ名、短縮名、アイコン、表示モード、テーマカラー、背景色が定義されている
5. Service Workerが本番ビルドで登録され、アプリシェルの静的リソースをキャッシュする
6. オフライン状態でも、キャッシュ済みのアプリシェルと過去に取得した会話データを閲覧できる
7. オンライン復帰後、APIから取得した最新の会話状態を表示できる
8. iPhoneのsafe area、ノッチ、ホームインジケーター領域を考慮した表示崩れがない
9. Android ChromeとiPhone Safariの主要画面幅で、チャット入力・会話切替・スクロールが操作できる
10. LighthouseのPWA監査と、実機のAndroid/iPhoneインストール確認を完了する

## 対象外

- App Store / Google Playへのネイティブアプリ登録
- React NativeやCapacitorによるネイティブアプリ化
- iOS/Android向けのプッシュ通知
- オフライン中のメッセージ送信キューと自動再送
- 画像や大容量データの無制限なオフライン保存
- 既存の認証・API仕様の変更

## 技術方針

- `vite-plugin-pwa`を利用する
- Web App ManifestをVite設定または`frontend/public/manifest.json`で提供する
- Service Workerはアプリシェルをprecacheする
- APIレスポンスのキャッシュ戦略は、認証情報やユーザー間データが混ざらないように慎重に分離する
- 会話データのオフライン閲覧は、現在のユーザーのデータだけをローカルに保存する
- 認証トークン、Cosmos DBキー、OpenCode Go APIキーはキャッシュ対象にしない
- iOS固有のメタタグ（`apple-mobile-web-app-capable`、`apple-mobile-web-app-status-bar-style`、`apple-touch-icon`）を設定する
- Android向けに192px / 512px以上のアイコンを用意する

## 関連ファイル

- `frontend/package.json`
- `frontend/vite.config.ts`
- `frontend/public/manifest.json`（新規または生成設定へ統合）
- `frontend/public/icons/`（新規）
- `frontend/index.html`
- `frontend/src/index.css`
- `frontend/src/services/api.ts`
- `frontend/src/services/chatApi.ts`
- `frontend/tests/`

## テスト方針

### 自動テスト

- Manifestの必須項目が存在する
- Service Worker登録コードが本番ビルドに含まれる
- キャッシュ対象に認証情報・APIキーが含まれない
- PWA設定が開発ビルドと本番ビルドで期待どおり切り替わる

### ブラウザテスト

- Android Chrome相当のPlaywright viewportでインストール関連要素を確認
- iPhone Safari相当のviewportでsafe areaと操作性を確認
- オフライン化後にアプリシェルとキャッシュ済み会話が表示される
- オンライン復帰後に最新会話一覧へ更新できる

### 実機確認

- Android Chromeの「インストール」または「ホーム画面に追加」
- iPhone Safariの共有メニューから「ホーム画面に追加」
- ホーム画面から起動したstandalone表示
- 画面回転、ノッチ、safe area、キーボード表示

## 実装メモ

- 実装: `vite-plugin-pwa@0.20.5` / `frontend/pwa-options.ts` で manifest（DoyonChat/standalone/#0f172a/#f9fafb/3 icons）/ workbox（precache 15件, /api/* NetworkOnly, denylist /^\\/api\\//）を一元管理、`vite.config.ts` は `VitePWA(pwaOptions)` のみ。`index.html` に `viewport-fit=cover` / `theme-color` / `apple-mobile-web-app-*` / `apple-touch-icon`、`index.css` に `.pt-safe/.pb-safe`（`env(safe-area-inset-*)`）を `AppLayout/ChatInput` へ適用。
- アイコン: 提供画像 `copilot_image_1787094399152.jpeg` (1024) → `icon-192x192.png` / `icon-512x512.png` / `icon-512x512-maskable.png` / `apple-touch-icon.png(180)` を `frontend/public/icons/` に生成・コミット。
- テスト: `frontend/tests/unit/pwa.test.ts` 8件追加、46/46 passed。`npm run build` で `manifest.webmanifest` / `sw.js` / `workbox-*.js` 生成を確認（precacheに`/api`なし、NetworkOnly正）。
- コミット: `f27931e` docs(spec/plan/icons) / `bb5d5b8` feat(PWA実装) / 本コミット docs(完了)。ブランチ `feat/011-pwa-android-ios` を `origin` へ push、デプロイ後に実機（Android Chrome / iPhone Safari）でホーム追加→standalone起動を確認。
- 注意: `pwa-options.ts` はテストから `vite.config.ts` を直接 import すると jsdom+esbuild でクラッシュするため shared module 化。`devOptions.enabled=false` で開発ビルドでは SW 無効。

---

## 変更履歴

| 日付 | ステータス | 備考 |
|------|-----------|------|
| 2026-08-12 | 🔴 未対応 | PWAをAndroid / iPhone対応として具体化。既存P4-001からP3-011へ整理 |
| 2026-08-23 | 🟡 進行中 | ブランチ feat/011-pwa-android-ios 作成、specs/P3-011/spec.md・plan.md 作成、アイコン生成（copilot_image_1787094399152.jpeg → frontend/public/icons/） |
| 2026-08-23 | 🟢 対応済み | vite-plugin-pwa実装・テスト完了、実機（Android/iPhone）で standalone 起動を確認、デプロイ完了 |
