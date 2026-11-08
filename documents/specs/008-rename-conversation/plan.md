# Implementation Plan: 会話の手動リネーム

**Branch**: `[008-rename-conversation]` | **Date**: 2026-08-22 | **Spec**: [spec.md](./spec.md)

**Input**: [Feature specification](./spec.md)

**Implementation Status**: Code, automated verification, desktop/mobile viewport verification, and production deployment complete (2026-08-22)

## Summary

サイドバーの会話タイトルをインライン編集し、EnterキーでAzure Functionsへ保存できるようにする。非アクティブ会話のリネームでは会話を切り替えず、Escキー・フォーカスアウト・空入力では変更を破棄する。保存失敗時は入力を維持してインラインエラーを表示する。

Functionsには既存のモデル更新APIと同じ構成で`PUT /api/conversations/{id}/title`を追加する。更新対象は認証済みユーザーが所有するConversationに限定し、trim後1文字以上100文字以下のタイトルを保存する。リネームでは`updatedAt`を変更せず、会話一覧の活動順を維持する。

## Technical Context

**Runtime**: Node.js 20, Azure Functions programming model v4

**Frontend**: React 18, Vite, TypeScript, Tailwind CSS, Vitest

**Backend**: Azure Functions (`functions/`) のみ

**Database**: Azure Cosmos DB SQL API

- `conversations` partition key: `/id`
- 既存Conversationドキュメントを`replace`してタイトルだけを更新
- コンテナー変更・データ移行は行わない
- Cosmos DBを利用できないローカル開発では既存in-memory fallbackを利用

**Authentication**: Microsoft Entra ID。Functionsで取得した`userId`をservice層へ渡し、所有権を検証する

**Testing**: Jest（Functions）、Vitest（Frontend）

**Constraints**:

- P1-006/P2-006で定義済みの所有権・404・503方針を維持する
- 既存の`PUT /api/conversations/{id}/model`と同じ責務分割を利用する
- リネームで`updatedAt`を変更しない
- desktop/mobileで同じConversationListを利用する
- 自動タイトル生成はP1-004の対象とする
- エラーUX全体の統一はP2-003の対象とする

## Design Decisions

### D1. タイトル専用のPUTエンドポイントを追加する

既存のモデル更新APIに合わせ、`PUT /api/conversations/{id}/title`を追加する。

```ts
interface UpdateConversationTitleRequest {
  title: string;
}
```

成功時は更新済みConversation全文を200で返す。汎用PATCHエンドポイントは導入せず、今回必要なtitle更新だけを追加する。

### D2. FrontendとFunctionsの両方で同じ入力条件を検証する

保存値は前後空白を除去し、1文字以上100 Unicodeコードポイント以下とする。

- Frontend: 空入力はキャンセル、100文字超過はインラインエラーとしてAPI呼び出し前に拒否
- Functions: 直接APIを呼ばれた場合も同じ条件を検証し、不正入力は400

共通validationモジュールは新設せず、各層に最小限の検証を置く。文字数は`Array.from(title).length`で数え、ASCII、日本語、絵文字の境界を同じテストケースで確認する。

### D3. リネームで会話を切り替えない

ConversationListの行クリックは既存の会話選択を維持する。タイトル表示と入力欄のイベント伝播を停止し、タイトル操作はリネームだけを開始する。

タイトル表示はキーボード操作可能なbutton相当とし、入力欄には現在値を設定して自動フォーカスする。削除ボタンの操作も従来どおり独立させる。

### D4. 保存契機はEnterだけとする

- Enter: 有効な値を保存
- Esc: キャンセル
- blur: キャンセル
- IME composition中のEnter: 無視
- trim後空のEnter: APIを呼ばずキャンセル

blur時に暗黙保存しないことで、バックログの「Enterで保存、Escでキャンセル」を明確に保つ。

### D5. 更新成功後にサーバーのConversationでローカル状態を置き換える

`useConversations`へ`updateTitle`を追加し、API成功時に該当Conversationをレスポンス全体で置き換える。Conversation配列をAppからAppLayoutへ渡す既存構成を利用し、サイドバーとアクティブ会話ヘッダーを同じ状態から更新する。

更新失敗時は配列を変更せず、ConversationListの編集値とエラーを維持する。

### D6. リネームではupdatedAtを変更しない

Conversation一覧は`updatedAt`降順で取得される。タイトル変更は会話活動ではないため、service層では既存Conversationを`{ ...existing, title }`として更新し、`updatedAt`を維持する。

Frontendも配列を並び替えず、現在位置のConversationだけを置き換える。これにより保存直後と再読み込み後で一覧順が一致する。

### D7. 既存の所有権境界を再利用する

`updateConversationTitle`は`getConversation(id, userId)`を利用し、取得できない場合は`null`を返す。HTTP handlerは存在しない会話と他ユーザーの会話の両方を404として扱い、所有者情報を開示しない。

### D8. 機能固有エラーだけをインライン表示する

100文字超過と更新API失敗は、対象Conversationの編集UI内に表示する。API失敗では入力と編集状態を維持して再試行可能にする。

エラー種別ごとの文言体系やアプリ全体の通知コンポーネントは導入せず、P2-003の範囲とする。

## Target Project Structure

### Documentation

```text
specs/008-rename-conversation/
├── spec.md
└── plan.md
```

### Functions

```text
functions/
├── src/
│   ├── functions/
│   │   └── conversations.ts          # title handlerとroute登録
│   └── services/
│       └── conversationService.ts    # 所有権付きtitle更新
└── tests/
    ├── integration/
    │   └── api.test.ts               # title API契約
    └── unit/
        └── conversationService.test.ts
```

### Frontend

```text
frontend/
├── src/
│   ├── App.tsx                              # updateTitle callback配線
│   ├── components/
│   │   ├── Layout/
│   │   │   └── AppLayout.tsx                # ConversationListへcallback伝播
│   │   └── Sidebar/
│   │       └── ConversationList.tsx         # インライン編集UI
│   ├── hooks/
│   │   └── useConversations.ts              # updateTitleと一覧state更新
│   └── services/
│       └── chatApi.ts                       # title更新API
└── tests/
    └── unit/
        ├── ConversationList.test.tsx
        └── chatApi.test.ts
```

Conversation型とCosmos DBスキーマは変更しない。

## Implementation Phases

### Phase 0: Spec・契約の確定

**Status**: 完了

**Tasks**:

- [x] 非アクティブ会話のタイトルクリックは会話を切り替えず編集だけ開始する
- [x] Enterだけを保存契機とし、Escとblurはキャンセルにする
- [x] trim後1文字以上100文字以下を入力条件とする
- [x] 空入力のEnterはAPIを呼ばず元タイトルへ戻す
- [x] API失敗時は入力を保持し、インラインエラーを表示する
- [x] リネームで`updatedAt`と一覧順を変更しない
- [x] Functionsのtitle専用PUT契約を定義する

**Verification**:

- [x] [spec.md](./spec.md)の受け入れ条件とAPI契約をレビューする
- [x] P1-006の所有権ルールと矛盾しないことを確認する
- [x] P1-004、P2-002、P2-003とのスコープ境界を明記する

### Phase 1: Functionsのタイトル更新API

**Files**:

- `functions/src/functions/conversations.ts`
- `functions/src/services/conversationService.ts`
- `functions/tests/unit/conversationService.test.ts`
- `functions/tests/integration/api.test.ts`

**Tasks**:

- [x] `updateConversationTitle(id, title, userId)`をserviceへ追加する
- [x] titleの前後空白除去と1〜100文字の検証をhandlerへ追加する
- [x] `PUT /api/conversations/{id}/title`を登録する
- [x] 成功時に更新済みConversationを200で返す
- [x] 不正入力を400として返す
- [x] 存在しない会話と他ユーザーの会話を404として返す
- [x] `updatedAt`とtitle以外のConversationフィールドを維持する
- [x] Cosmos DBとin-memory fallbackの両方を更新する

**Verification**:

- [x] 有効なタイトルがtrimされ、200レスポンスと保存結果へ反映される
- [x] 欠落、非文字列、空白のみ、100文字超過が400になる
- [x] 別ユーザーの会話と存在しない会話が404になる
- [x] 更新前後で`updatedAt`、`id`、`userId`、`model`、`createdAt`が変わらない
- [x] Cosmos DB必須時の既存503方針を維持する

### Phase 2: FrontendのAPIと会話状態更新

**Files**:

- `frontend/src/services/chatApi.ts`
- `frontend/src/hooks/useConversations.ts`
- `frontend/src/App.tsx`
- `frontend/src/components/Layout/AppLayout.tsx`
- `frontend/tests/unit/chatApi.test.ts`

**Tasks**:

- [x] `updateConversationTitle(id, title)` API clientを追加する
- [x] `useConversations`へ`updateTitle`を追加する
- [x] 成功レスポンスで該当Conversationだけを置き換える
- [x] 更新失敗時にConversation配列を変更しない
- [x] ConversationListまで更新callbackを配線する
- [x] アクティブ会話ヘッダーが同じConversation配列から更新されることを維持する

**Verification**:

- [x] API clientが正しいmethod・path・bodyを送信する
- [x] 成功時に該当Conversationだけが置き換わる
- [x] 成功時も配列順が維持される
- [x] API失敗時に既存Conversation stateが維持される
- [x] アクティブ会話のリネーム成功後にヘッダーが更新される

### Phase 3: ConversationListのインライン編集UI

**Files**:

- `frontend/src/components/Sidebar/ConversationList.tsx`
- `frontend/tests/unit/ConversationList.test.tsx`

**Tasks**:

- [x] 編集対象ID、入力値、保存中、エラーの最小stateを追加する
- [x] タイトル表示をクリック・キーボード操作可能にする
- [x] 現在タイトル入りinputへの切り替えとフォーカスを実装する
- [x] Enter保存、Escキャンセル、blurキャンセルを実装する
- [x] composition中のEnterを無視する
- [x] 空入力のEnterでAPIを呼ばず元タイトルへ戻す
- [x] 100文字超過をAPI呼び出し前に拒否してエラー表示する
- [x] 保存中の二重送信を防ぐ
- [x] API失敗時に入力・編集状態を維持してエラー表示する
- [x] 成功時に編集状態とエラーを解除する
- [x] タイトル・inputイベントを行選択と削除操作から分離する
- [x] desktop/mobile共通の既存レイアウトを維持する

**Verification**:

- [x] タイトルクリックで現在値入りinputへ切り替わりフォーカスされる
- [x] 非アクティブ会話の編集で会話選択callbackが呼ばれない
- [x] Enterで保存callbackが1回だけ呼ばれる
- [x] Esc、blur、空入力のEnterで保存callbackが呼ばれない
- [x] composition中のEnterで保存callbackが呼ばれない
- [x] 100文字超過時に入力エラーが表示される
- [x] API失敗後に入力が残り再試行できる
- [x] 同時に編集状態となる会話が1件だけである
- [x] キーボードで編集開始・保存・キャンセルできる

### Phase 4: 全体検証とバックログ更新

**Tasks**:

- [x] Functionsのbuildとunit/integration testを実行する
- [x] Frontendのbuildとunit testを実行する
- [x] Frontendのlintを実行する（変更箇所の新規警告なし、既存3警告あり）
- [x] desktop幅で編集、保存、キャンセル、再試行を確認する
- [x] mobile viewport（390×844）で編集、保存、キャンセルを確認する
- [x] 再読み込み後の永続化を確認する
- [x] リネームで一覧順が変わらないことを確認する
- [x] P2-005バックログの実装メモと変更履歴を更新する
- [x] バックログ一覧のステータスを対応済みへ更新する

**Verification Commands**:

```bash
cd functions
npm run build
npm test -- --runInBand

cd ../frontend
npm run build
npm test -- --run
npm run lint
```

## Test Strategy

### Functions Unit Tests

- 所有するConversationのtitleだけを更新する
- 前後空白を除去したtitleを保存する
- `updatedAt`と他フィールドを維持する
- 他ユーザーまたは存在しないConversationで`null`を返す
- in-memory fallbackで更新結果を再取得できる
- Cosmos DBの`replace`へ期待するConversationを渡す
- Cosmos DB必須時のエラー挙動を維持する

### Functions Integration Tests

- `PUT /api/conversations/{id}/title`の200レスポンス
- 不正JSON、title欠落、非文字列、空白のみ、100文字超過の400
- 認証不可の401
- 存在しない会話と他ユーザー会話の404
- 成功レスポンスと再取得結果の一致
- 既存GET、DELETE、model更新APIの非回帰

### Frontend Unit Tests

- API clientのmethod・path・trim済みbody
- hookの成功時置換、順序維持、失敗時state維持
- タイトルクリック時の編集開始と初期値
- 非アクティブ会話を選択しないイベント伝播
- Enter保存と二重送信防止
- Esc、blur、空入力でのキャンセル
- IME composition中Enterの無視
- 100文字境界と超過エラー
- API失敗時の入力・エラー維持と再試行
- アクティブ会話ヘッダーへの反映

### Manual Verification

- [x] desktopブラウザで保存、Escキャンセル、失敗後の再試行、アクティブ見出し更新を確認
- [x] mobile viewport（390×844）でサイドバーの編集、保存、Escキャンセルを確認
- [x] 保存後のページ再読み込みと一覧順維持を確認
- [x] 日本語IMEと絵文字はunit test、重複タイトルの許容は仕様・実装レビューで確認

実機のタップ・ソフトウェアキーボード操作は未実施。mobile breakpointの回帰はviewport確認とunit testで検証した。

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| タイトルクリックで会話選択も発生する | タイトルbuttonとinputで行クリックへのイベント伝播を停止し、component testで選択callbackが0回であることを確認する |
| IMEの変換確定Enterで意図せず保存する | `isComposing`を確認し、composition eventを含むtestを追加する |
| blurキャンセルとEnter保存が競合する | 保存処理で保存中stateを設定し、イベント順をcomponent testで固定する |
| API失敗時に楽観更新したタイトルが残る | 成功レスポンス受信後だけConversation配列を置き換える |
| リネーム後の再読み込みで一覧順が変わる | serviceで`updatedAt`を維持し、Frontendも配列を並び替えない |
| FrontendとFunctionsで長さ判定がずれる | 同じ1文字・100文字・101文字の境界ケースを両方でテストする |
| 他ユーザーの会話情報が漏れる | 既存`getConversation(id, userId)`を利用し、不存在と他ユーザーを同じ404にする |
| 機能固有エラー表示がP2-003へ拡大する | 入力超過と更新失敗のインライン表示だけに限定する |

## Deliverables

- [x] `specs/008-rename-conversation/spec.md`
- [x] `specs/008-rename-conversation/plan.md`
- [x] Functionsのタイトル更新APIとservice
- [x] Frontendのtitle更新clientと会話state更新
- [x] ConversationListのインライン編集UI
- [x] Functions / Frontendの自動テスト
- [x] desktop / mobile viewportの手動確認
- [x] P2-005バックログの実装メモ・変更履歴更新
