# Feature Specification: PWA対応（AndroidとiPhone両方）

**Feature Branch**: `feat/011-pwa-android-ios` | **Spec Folder**: `specs/P3-011` | **Created**: 2026-08-23

**Status**: Draft

**Input**: [P3-011 backlog item](../000_backlog/items/P3-011-pwa-android-ios.md)

> **現行構成に関する注記:** Frontendは `frontend/`（React 18 + Vite 5 + Tailwind）。Backendは Azure Functions (`functions/`)。認証は Entra ID。`frontend/public` は本機能で新設する。

## User Scenarios & Testing

### User Story 1 - AndroidとiPhoneでホーム画面に追加して起動する (Priority: P3)

ユーザーは Android Chrome の「インストール」/「ホーム画面に追加」と、iPhone Safari の共有メニュー「ホーム画面に追加」から DoyonChat を追加し、ホーム画面のアイコンからブラウザの通常タブではなく standalone で起動できる。

**Why this priority**: モバイルでブラウザを開かずに即アクセスできることが PWA の核心価値。

**Independent Test**: Android実機（またはChrome）でインストールバナーを確認、iPhone実機（Safari）で共有メニューから追加を確認、両方でホームアイコン起動が standalone 表示であることを確認できる。

**Acceptance Scenarios**:

1. **Given** Android Chrome で DoyonChat を開いている状態、**When** メニューから「インストール」または「ホーム画面に追加」を実行する、**Then** ホーム画面にアプリアイコンが追加される
2. **Given** iPhone Safari で DoyonChat を開いている状態、**When** 共有メニューから「ホーム画面に追加」を実行する、**Then** ホーム画面にアプリアイコンが追加される
3. **Given** ホーム画面のアイコンから起動した状態、**When** アプリが表示される、**Then** ブラウザのアドレスバーやタブUIではなく standalone 表示で全画面に表示される（Android / iPhone 共通）
4. **Given** standalone 起動した状態、**When** 画面を操作する、**Then** 通常のチャット操作（会話切替、メッセージ送信、スクロール）がブラウザタブと同様に行える

### User Story 2 - アプリシェルと過去会話をオフラインで閲覧し、オンライン復帰後に最新へ更新する (Priority: P3)

ユーザーはネットワークが一時的に不安定でも、キャッシュ済みのアプリシェルと直近に取得した会話データを閲覧でき、オンライン復帰後は最新状態へ更新できる。

**Why this priority**: バックログ受け入れ条件 6, 7。モバイルの不安定環境での閲覧性向上。

**Independent Test**: 本番ビルドを起動し、一度オンラインで会話一覧とメッセージを取得した後、DevToolsでオフライン化してリロードし、シェルとキャッシュ済み会話が表示されることを確認する。オンライン復帰後に再取得で最新一覧へ更新されることを確認できる。

**Acceptance Scenarios**:

1. **Given** オンラインで会話一覧とメッセージを取得済みの状態、**When** オフラインにしてリロードする、**Then** アプリシェル（ヘッダー、サイドバー枠、レイアウト）とキャッシュ済み会話データが表示される
2. **Given** オフラインでキャッシュ済み会話を表示している状態、**When** オンラインに復帰し再取得する、**Then** APIから取得した最新の会話状態が表示される
3. **Given** オフラインの状態、**When** 未取得の会話へアクセスしようとする、**Then** ネットワークエラーとして適切に表示され、キャッシュ済みでないデータの無制限な閲覧は求めない
4. **Given** 会話データがキャッシュされている状態、**When** 別ユーザーのデータが混在しないか確認する、**Then** 現在認証中ユーザーのデータだけが参照され、他ユーザー間の混在がない（認証トークン・APIキーはキャッシュ対象外）

### User Story 3 - ManifestとService Workerが正しく提供される (Priority: P3)

PWAとして判定されるために、Web App Manifest と Service Worker が本番ビルドで正しく提供・登録される。

**Why this priority**: Lighthouse PWA 監査とインストール判定の前提条件。

**Independent Test**: 本番ビルド (`vite build && vite preview`) で Manifest が取得でき、Service Worker が登録され、静的リソースが precache されていることを DevTools Application パネルで確認できる。開発ビルドでは SW が登録されないことを確認できる。

**Acceptance Scenarios**:

1. **Given** 本番ビルドでアプリを開いている状態、**When** DevTools Application > Manifest を確認する、**Then** `name` / `short_name` / `icons` / `display: standalone` / `theme_color` / `background_color` / `start_url` / `scope` が定義されている
2. **Given** 本番ビルドでアプリを開いている状態、**When** DevTools Application > Service Workers を確認する、**Then** Service Worker が登録され、アプリシェルの静的リソース（JS/CSS/HTML/アイコン）が precache されている
3. **Given** 開発ビルド (`vite dev`) でアプリを開いている状態、**When** Service Worker の登録を確認する、**Then** 登録されない、または開発用の無効状態である
4. **Given** Lighthouse PWA 監査を実行した状態、**When** 結果を確認する、**Then** インストール可能判定を含む主要監査がパスする

### User Story 4 - iPhoneのsafe areaと画面幅で崩れず操作できる (Priority: P3)

iPhone のノッチ、ホームインジケーター、safe area を考慮しても表示崩れがなく、Android と iPhone の主要画面幅でチャット入力・会話切替・スクロールが操作できる。

**Why this priority**: バックログ受け入れ条件 8, 9。実機での操作性担保。

**Independent Test**: Playwright の iPhone Safari viewport と Android Chrome viewport、実機の縦横回転で、入力欄がホームインジケーターに埋もれず、会話切替とスクロールが操作できることを確認できる。

**Acceptance Scenarios**:

1. **Given** iPhone のホーム画面から standalone 起動した状態、**When** チャット画面を表示する、**Then** ノッチやホームインジケーター領域にコンテンツが隠れず、safe area を考慮した余白が確保される
2. **Given** iPhone Safari の viewport（390x844 等）で表示した状態、**When** チャット入力欄を操作する、**Then** キーボード表示時を含めて入力欄が操作可能である
3. **Given** Android Chrome の viewport（360x740 等）で表示した状態、**When** 会話切替とスクロールを操作する、**Then** タッチ操作が阻害されずに行える
4. **Given** 画面を回転させた状態、**When** 縦横それぞれで表示する、**Then** レイアウト崩れがない

## Edge Cases

- **未認証状態**: Auth 有効時に未ログインでも Manifest / SW は提供されるが、会話APIのキャッシュは認証後にのみ評価する。認証情報は一切キャッシュしない
- **アイコン欠損**: 192px / 512px アイコンが取得できない場合はインストール判定が失敗することを自動テストで検出する
- **Service Worker 更新**: 新しいデプロイ後は旧SWが更新され、再読み込みで最新シェルが表示される（`vite-plugin-pwa` の `autoUpdate` 前提）
- **オフライン中の送信**: 送信試行はネットワークエラーとして表示し、キューや自動再送は行わない（対象外）
- **画像・大容量データ**: 画像バイナリや大きな会話履歴の無制限保存は行わない。会話テキストの直近取得分のみを対象とする
- **iOS の standalone 判定**: iOS Safari は Manifest の `display` ではなく `apple-mobile-web-app-capable` に依存するため両方を設定する

## Requirements

### Functional Requirements

- **FR-001**: `vite-plugin-pwa` を利用し、Frontend の Vite 設定で PWA を構成しなければならない
- **FR-002**: Web App Manifest は `name: DoyonChat` / `short_name: DoyonChat` / `display: standalone` / `start_url: /` / `scope: /` / `description` を含まなければならない
- **FR-003**: Manifest は `theme_color: #0f172a` / `background_color: #f9fafb` を含まなければならない（提案値。変更時は spec と実装を同時更新する）
- **FR-004**: Android向けに 192x192(any) と 512x512(any) と 512x512(maskable) の3エントリを提供し、Manifest の `icons` に `purpose: any` と `purpose: maskable` を含めなければならない
- **FR-005**: iOS向けに `apple-touch-icon`（180x180）を提供し、`index.html` に `apple-mobile-web-app-capable` / `apple-mobile-web-app-status-bar-style` / `apple-touch-icon` リンクを設定しなければならない
- **FR-006**: 元画像は `copilot_image_1787094399152.jpeg`（1024x1024 PNGデータ）から生成し、`frontend/public/icons/` 配下に配置しなければならない
- **FR-007**: Service Worker は本番ビルドでのみ登録され、開発ビルドでは登録してはならない
- **FR-008**: Service Worker はアプリシェルの静的リソース（HTML/JS/CSS/アイコン/favico）を precache し、`/api/*` をキャッシュ対象に含めてはならない
- **FR-009**: Service Worker のキャッシュから認証トークン、Cosmos DBキー、OpenCode Go APIキーを除外しなければならない
- **FR-010**: オフライン時は precache されたシェルと直近取得済みの会話データのみを閲覧可能とし、未取得データの無制限なオフライン保存は行ってはならない
- **FR-011**: オンライン復帰後は API から最新の会話一覧とメッセージを再取得して表示を更新しなければならない
- **FR-012**: `frontend/src/index.css` は `env(safe-area-inset-*)` を用いて iPhone のノッチ・ホームインジケーター領域を考慮したレイアウト調整を行わなければならない
- **FR-013**: `frontend/index.html` の `viewport` は `viewport-fit=cover` を含まなければならない
- **FR-014**: Lighthouse PWA 監査でインストール可能判定が成功しなければならない
- **FR-015**: `frontend/public` 配下のアイコンと Manifest 由来ファイルは本番ビルド成果物に含めなければならない

### Non-Functional Requirements

- **NFR-001**: Service Worker の更新は `autoUpdate` により再訪問時に自動反映され、手動の更新ボタンは要求しない
- **NFR-002**: PWA設定の追加により既存の Entra ID 認証フローと会話APIの挙動を変更してはならない

### API Contract

本機能は新規APIを追加しない。既存の `GET /api/conversations` / `GET /api/conversations/{id}/messages` 等は変更しない。

## Success Criteria

### Measurable Outcomes

- **SC-001**: Android Chrome でホーム画面追加と standalone 起動が成功する
- **SC-002**: iPhone Safari で共有メニューからのホーム追加と standalone 起動が成功する
- **SC-003**: Manifest に FR-002〜FR-004 の全項目が定義されている
- **SC-004**: 本番ビルドで Service Worker が登録され、DevTools で precache を確認できる
- **SC-005**: 開発ビルドで Service Worker が登録されない
- **SC-006**: オフラインでシェルとキャッシュ済み会話が表示される
- **SC-007**: オンライン復帰後に最新会話へ更新される
- **SC-008**: iPhone の safe area で表示崩れがない
- **SC-009**: Android / iPhone の主要 viewport で入力・切替・スクロールが操作できる
- **SC-010**: Lighthouse PWA 監査（または同等のPWAチェック）がパスする
- **SC-011**: `/api/*` と認証情報が SW キャッシュに含まれない
- **SC-012**: `npm run build` / `npm test` / `npm run lint` が成功し、今回差分に新規 lint 警告がない

## Out of Scope

- App Store / Google Play へのネイティブアプリ登録
- React Native / Capacitor によるネイティブアプリ化
- iOS / Android 向けプッシュ通知
- オフライン中のメッセージ送信キューと自動再送
- 画像や大容量データの無制限なオフライン保存
- 既存の認証・API仕様の変更

## Assumptions

- `name` / `short_name` は `DoyonChat` とする。変更が必要な場合は spec と Manifest を同時更新する
- `theme_color: #0f172a` / `background_color: #f9fafb` は現行 Tailwind の配色に合わせた提案値。デザイン確定時に更新する
- アイコンは提供された 1024x1024 画像から 192 / 512 / 180 を生成する。maskable は 512 を流用し、必要に応じて padding を付与する
- Service Worker 戦略は「アプリシェルのみ precache、API は NetworkOnly」の案Aを採用する（ユーザー分離の安全を最優先）
- 仕様フォルダは `specs/P3-011` とする（ブランチ名 `feat/011-pwa-android-ios` と対応）
