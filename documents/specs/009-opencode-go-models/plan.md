# Implementation Plan: OpenCode Go公式モデルカタログ更新

**Branch**: `[009-opencode-go-models]` | **Date**: 2026-08-22 | **Spec**: [spec.md](./spec.md)

**Input**: [Feature specification](./spec.md)

**Implementation Status**: Original 23-model implementation was verified and deployed (2026-08-23). The 2026-08-31 catalog refresh is implemented, automated tests and 26-model live verification pass; production deployment is pending.

## Summary

OpenCode Go公式Endpoints表の26モデルをFunctions内の単一カタログへ定義し、Responses 3件、Chat Completions 15件、Messages 8件を正しい上流APIへルーティングする。Frontendは`GET /api/models`を通じて26件を表示し、利用不可モデルを保持する既存会話では履歴を維持しながら送信を停止して再選択を促す。

全26モデルの実チャットは、通常テスト・CIから隔離した専用live testで直列確認する。実APIキーはGit除外済みローカル設定またはprocess environmentからのみ取得し、機密情報・プロンプト・回答・上流エラー本文をログへ出さない。

## Technical Context

**Runtime**: Node.js 20, Azure Functions programming model v4

**Frontend**: React 18, Vite, TypeScript, Tailwind CSS, Vitest

**Backend**: Azure Functions (`functions/`)

**Database**: Azure Cosmos DB SQL API。Conversationの既存`model`フィールドを維持し、スキーマ移行は行わない

**External API**: OpenCode Go

- Responses: `POST /zen/go/v1/responses`
- Chat Completions: `POST /zen/go/v1/chat/completions`
- Messages: `POST /zen/go/v1/messages`

**Testing**: Jest（Functions）、Vitest（Frontend）、専用Jest設定（live test）

**Constraints**:

- 公式Endpoints表の26件を正とし、`/v1/models`の33件を自動採用しない
- 既定モデル`kimi-k2.6`を維持する
- 正規モデルIDとprotocolを複数ファイルへ重複定義しない
- 通常テスト、CI、deploy testから実APIを呼ばない
- live testは26リクエストを直列実行し、自動retryしない
- 既存Conversationの未知model値を自動変更しない
- 409判定より前にuserメッセージを保存しない
- 今回の差分に無関係なモデルメタデータ・UIを変更しない

## Design Decisions

### D1. 静的カタログを実装上のsource of truthにする

`functions/src/config/modelCatalog.ts`を追加し、公開用`ModelInfo`と内部`protocol`を同じエントリで管理する。

```ts
type OpenCodeGoProtocol = 'responses' | 'chat-completions' | 'messages';

interface OpenCodeGoModelConfig {
  info: ModelInfo;
  protocol: OpenCodeGoProtocol;
}
```

`functions/src/functions/models.ts`は公開用情報だけを返し、`opencodeGo.ts`は同じカタログからprotocolを取得する。protocolをFrontendへ公開する新しいAPI契約は追加しない。

### D2. 公式Endpoints表を固定contract testにする

26のID、表示順、protocol件数、ID一意性、既定モデルがカタログ内にあることをunit testで固定する。モデル名の接頭辞・提供元からprotocolを推測しない。

公式表が変わった場合はカタログ、contract test、README、MVP仕様、live test結果を同じ変更で更新する。

### D3. 3プロトコルを共通StreamChunkへ正規化する

既存ResponsesとChat Completionsの処理を維持し、Messages adapterを追加する。各adapterはrequest bodyとSSEイベント解析だけを担当し、以下へ正規化する。

```ts
interface StreamChunk {
  content: string;
  reasoning?: string;
  done: boolean;
}
```

- Responses: response output text / reasoning / completed / error event
- Chat Completions: choices delta / `[DONE]`
- Messages: content block text / thinking delta / message stop / error event

正常完了はResponsesの`response.completed`、Chat Completionsの`[DONE]`、Messagesの`message_stop`だけとする。完了マーカー前のEOF、未知protocol、protocol固有error eventを成功や別protocolへのフォールバックとして扱わない。

Messagesは`Content-Type: application/json`、`x-api-key`、`anthropic-version: 2023-06-01`を送り、`{ model, messages, max_tokens, stream: true }`のtext block形式を使う。新規画像送信は保存前に400で拒否し、既存画像付き履歴は保存内容を変えずtext partだけを上流へ送り、画像だけで空contentになる過去メッセージはrequestから除外する。`streamChat`へ任意の`AbortSignal`を追加し、3protocolすべてのfetchへ渡す。

### D4. モデル検証をBackend境界へ置く

会話作成、モデル変更、chat送信の3箇所で同じカタログ照合関数を利用する。

- createでmodel省略: `kimi-k2.6`
- Frontendの新規会話作成: `models[0]`を送らずmodelを省略
- create/updateでmodelが非文字列または未知model: 400、保存なし
- 既存会話の未知modelでchat: 409、userメッセージ保存なし

汎用validation frameworkは導入せず、カタログの`hasModel(id)`を既存handler/serviceへ最小限配線する。

### D5. 利用不可モデルのDB値を保持する

既存Conversationのmodelを読み込み時に自動変換しない。Frontendはmodelsのloading・error・loadedを区別し、loading・error・利用不可を別理由で表示していずれも送信を停止する。loaded後に保存modelが見つからない場合だけ利用不可と判定する。

利用不可時は保存IDと「利用不可」を表示し、ChatInputを停止する一方、ModelSelectorは操作可能にする。正規モデルへの更新成功後は通常状態へ戻す。

### D6. live testを通常Jest rootsから隔離する

`functions/live-tests/`は既存`jest.config.js`の`roots: ['<rootDir>/tests']`外に置く。`jest.live.config.js`と`test:live:models`を追加し、専用コマンドだけで検出する。

live testは`streamChat`を直接呼ぶ。`chatHandler`は上流エラーをSSEエラーメッセージへ変換するため、実API疎通の成否判定には使用しない。

### D7. live testを低コスト・秘密非出力にする

- prompt: `Reply only OK`
- max output: 512 tokens（公式資料の通常出力125〜310 tokensを収める上限。短文応答なので未使用分は生成されない）
- concurrency: 1
- requests: 1 per model
- retry: 0
- timeout: 120 seconds per model

各モデルで`AbortController`を生成し、120秒経過時に上流fetchを中断する。中断したstreamの終了を待ってから次モデルへ進む。

各結果はmodel ID、protocol、成否、所要時間、サニタイズ済み分類だけを保持する。回答本文は空判定にだけ使い、保存・出力しない。上流例外はcatchし、HTTP status・timeout・empty-content・incomplete-streamなどの分類へ変換してから集約する。

### D8. ドキュメントの重複を同じ変更で同期する

READMEのモデル表・外部API説明、`specs/001-chat-app/spec.md`と`plan.md`の単一Chat Completions前提を更新する。P3-007の実API疎通条件はP2-011完了時に参照へ置き換え、P3-007全体の未対応ステータスは維持する。

## Target Project Structure

```text
functions/
├── src/
│   ├── config/
│   │   └── modelCatalog.ts
│   ├── functions/
│   │   ├── chat.ts
│   │   ├── conversations.ts
│   │   └── models.ts
│   └── services/
│       └── opencodeGo.ts
├── tests/
│   ├── integration/
│   └── unit/
├── live-tests/
│   └── models.live.test.ts
└── jest.live.config.js

frontend/
├── src/
│   ├── components/
│   │   ├── Chat/
│   │   └── Layout/
│   └── hooks/
└── tests/unit/

specs/009-opencode-go-models/
├── spec.md
└── plan.md
```

## Implementation Phases

### Phase 0: 仕様・contract testの固定

**Tasks**:

- [x] 公式Endpoints表の26モデルと確認日をspecへ記録する
- [x] Responses 3、Chat Completions 15、Messages 8を確定する
- [x] 既定モデル`kimi-k2.6`の維持を確定する
- [x] `/v1/models`にだけ存在する6件を対象外として記録する
- [x] 利用不可モデルの閲覧・送信停止・再選択動作を確定する
- [x] 26 ID、protocol、件数、一意性の失敗するcontract testを追加する

**Verification**:

- [x] [spec.md](./spec.md)と公式Endpoints表を照合する
- [x] P3-007とのスコープ境界を確認する
- [x] contract testが現行18件カタログとの差分を検出する

### Phase 1: モデルカタログの単一化

**Files**:

- `functions/src/config/modelCatalog.ts`
- `functions/src/functions/models.ts`
- `functions/tests/unit/modelCatalog.test.ts`
- `functions/tests/integration/api.test.ts`

**Tasks**:

- [x] 公開ModelInfoと内部protocolを持つ静的カタログを追加する
- [x] 既存18件を移し、新規5件を追加する
- [x] `models.ts`をカタログの公開情報から返すよう変更する
- [x] `DEFAULT_MODEL_ID`と`hasModel`をカタログから提供する
- [x] 新規5件へ仕様どおりの中立メタデータ（`quality: 3`、`speed/contextLength: Unknown`、`cost: See OpenCode Go`、`bestFor: General use`、spec記載の`description`）を設定する
- [x] MuseとOx Alphaの注意事項を公開説明へ反映する

**Verification**:

- [x] IDが26件で一意である
- [x] protocol件数が3 / 15 / 8である
- [x] `kimi-k2.6`が正規カタログ内にある
- [x] `GET /api/models`が正規26件を固定順で返す
- [x] 対象外7件が含まれない

### Phase 2: 3プロトコルのstream client

**Files**:

- `functions/src/services/opencodeGo.ts`
- `functions/src/services/reasoningNormalizer.ts`
- `functions/tests/unit/opencodeGo.test.ts`
- `functions/tests/unit/reasoningNormalizer.test.ts`

**Tasks**:

- [x] カタログのprotocolでResponses / Chat Completions / Messagesを分岐する
- [x] Responses 3モデルのrequestとSSE処理を共通化する
- [x] Chat Completions 15モデルの既存requestとSSE処理をカタログへ接続する
- [x] Messages 8モデルのrequestとSSE parserを追加する
- [x] Messagesのheadersと`{ model, messages, max_tokens, stream: true }` bodyを追加する
- [x] Messagesのtext / thinking / completion / error eventを正規化する
- [x] 3protocolの正常完了マーカーを固定し、マーカー前のEOFを未完了エラーにする
- [x] `streamChat`へ任意の`AbortSignal`を追加して全fetchへ渡す
- [x] 既存画像付き履歴はtext partだけを送り、空contentになる過去メッセージを除外する
- [x] protocol固有error eventを上流エラーとして扱う
- [x] `healthCheck`も正規protocolを利用する

**Verification**:

- [x] 26モデルすべてが期待URLへ送信される
- [x] 3protocolのrequest bodyが各API契約と一致する
- [x] MessagesのURL、headers、bodyがfixture contractと一致する
- [x] 本文、Reasoning、完了が共通StreamChunkへ変換される
- [x] 完了マーカー前のEOFが未完了エラーになる
- [x] 渡したAbortSignalが全protocolのfetchへ伝播する
- [x] HTTPエラーとSSE error eventが成功完了にならない
- [x] 未知model / protocolがChat Completionsへfallbackしない
- [x] 既存Reasoning表示用parserの回帰がない

### Phase 3: Backendモデル検証と409境界

**Files**:

- `functions/src/functions/conversations.ts`
- `functions/src/functions/chat.ts`
- `functions/src/services/conversationService.ts`
- `functions/tests/integration/api.test.ts`

**Tasks**:

- [x] 会話作成時に省略modelへ`kimi-k2.6`を設定する
- [x] 会話作成とモデル変更で正規カタログを検証する
- [x] 非文字列modelと未知modelを400として保存前に拒否する
- [x] chat開始時にConversationのmodelを再検証する
- [x] Messagesモデルへの新規画像送信をuserメッセージ保存前に400で拒否する
- [x] 利用不可modelを409としてuserメッセージ保存前に拒否する
- [x] 正規modelの既存所有権・404挙動を維持する

**Verification**:

- [x] 26モデルの作成・更新が成功する
- [x] 非文字列modelと未知modelの作成・更新が400になり保存されない
- [x] Messagesモデルへの新規画像送信が400になり保存されない
- [x] 既存利用不可modelのchatが409になる
- [x] 409時にuser / assistantメッセージが増えない
- [x] 他ユーザー会話の404境界を維持する

### Phase 4: Frontendの利用不可モデル状態

**Files**:

- `frontend/src/App.tsx`
- `frontend/src/components/Layout/AppLayout.tsx`
- `frontend/src/components/Chat/ChatInput.tsx`
- `frontend/tests/unit/AppLayout.test.tsx`
- `frontend/tests/unit/ChatInput.test.tsx`

**Tasks**:

- [x] 新規会話作成時にFrontendからmodelを省略し、Backend既定値を利用する
- [x] modelsのloading / error / loadedを明示的に扱う
- [x] 保存modelがloadedカタログにない場合だけ利用不可と判定する
- [x] 先頭モデルへの表示fallbackを削除する
- [x] 保存IDと「利用不可」、再選択案内を表示する
- [x] 利用不可時にChatInputを停止する
- [x] 利用不可時もModelSelectorを操作可能にする
- [x] 正規モデル保存後に入力・送信を再開する

**Verification**:

- [x] 26モデルが選択UIへ重複なく表示される
- [x] 新規会話作成requestにmodelがなく、保存結果が`kimi-k2.6`になる
- [x] loading / error / 利用不可が別理由で表示され、いずれも送信できない
- [x] 利用不可modelの保存IDと案内が表示される
- [x] 利用不可時は送信callbackが呼ばれない
- [x] 再選択成功後に送信可能になる
- [x] 正規モデルを持つ既存会話の表示・送信に回帰がない

### Phase 5: live test harness

**Files**:

- `functions/live-tests/models.live.test.ts`
- `functions/jest.live.config.js`
- `functions/package.json`
- `functions/local.settings.json.example`

**Tasks**:

- [x] 通常Jest roots外へlive testを追加する
- [x] 専用Jest設定と`test:live:models` scriptを追加する
- [x] process environmentとlocal settingsからAPIキーを安全に解決する
- [x] 未設定・テンプレートキーをAPI呼び出し前に拒否する
- [x] 26モデルを直列で各1回実行する
- [x] 本文受信と正常完了の両方を成功条件にする
- [x] 120秒で`AbortController`によりfetchを中断し、中断完了後に次モデルへ進む
- [x] retryなし、512 tokens上限を実装する
- [x] 失敗を継続収集し、最後に集約して失敗させる
- [x] ログをmodel / protocol / 成否 / 所要時間 / 分類だけに制限する

**Verification**:

- [x] `npm test`がlive testを検出しない
- [x] CI・deploy workflowがlive test scriptを呼ばない
- [x] キー未設定時にネットワーク呼び出し前で停止する
- [x] mockしたlive harnessで成功・timeout・429・本文なし・未完了を判定できる
- [x] timeout時にfetchが中断され、中断完了前に次モデルを開始しない
- [x] 失敗ログにキー、body、回答、上流error bodyが含まれない

`functions/local.settings.json.example`は既定モデルを変更しない。live testの読み込み方法に説明追加が必要な場合だけ変更する。

### Phase 6: 全26モデルの実API疎通

**Prerequisite**:

- ユーザーが実APIキーを`functions/local.settings.json`へ設定するか、process environmentへ設定する
- キーはチャットへ貼り付けず、Git管理しない

**Tasks**:

- [x] `npm run test:live:models`を更新後のカタログで1回実行する
- [x] Responses 3モデルの成功を確認する
- [x] Chat Completions 15モデルの成功を確認する
- [x] Messages 8モデルの成功を確認する
- [x] 26/26成功を実装メモへ記録する

**Verification**:

- [x] 全モデルで空でない本文を受信する
- [x] 全モデルで正常完了へ到達する
- [x] 429、timeout、HTTP/SSE errorが残っていない
- [x] ログへ機密情報・本文が出ていない

### Phase 7: ドキュメント同期・全体検証

**Tasks**:

- [x] READMEの外部API説明とモデル表を3protocol・26件へ更新する
- [x] READMEへlive testの安全な実行手順を追加する
- [x] `specs/001-chat-app/spec.md`の単一Chat Completions前提を更新する
- [x] `specs/001-chat-app/plan.md`の旧モデル表とAPI説明を更新する
- [x] P3-007へP2-011で実API疎通済みの参照を追記する
- [x] P2-011の実装メモ・変更履歴を更新する
- [x] Functions / Frontendの全testとbuildを実行する
- [x] Frontend lintを実行し、今回の差分に新規警告がないことを確認する
- [x] `git diff --check`を実行する

## Verification Commands

```bash
cd functions
npm run build
npm test -- --runInBand
npm run test:live:models

cd ../frontend
npm run build
npm test -- --run
npm run lint
```

## Test Strategy

### Functions Unit / Contract Tests

- 正規26 ID、固定順、一意性、3 / 15 / 8件、既定モデル
- 各modelのprotocolとrequest URL / body
- Messagesの`x-api-key` / `anthropic-version` headers、body、text-only変換、空content除外
- Responses / Chat Completions / Messagesの本文・Reasoning・完了・エラー・完了前EOF
- 全protocolへのAbortSignal伝播
- 未知model / protocolのfallback禁止
- live harnessの成功・fetch中断・中断待機・429・本文なし・未完了・ログsanitization

### Functions Integration Tests

- `GET /api/models`の正規26件
- 26モデルのConversation作成・model更新
- 非文字列model / 未知modelの400と非保存
- Messagesモデルへの新規画像送信の400と非保存
- 利用不可model Conversationのchat 409とメッセージ非保存
- 認証・所有権・404・503の既存境界

### Frontend Unit Tests

- モデル選択UIの26件表示
- 新規会話作成時のmodel省略とBackend既定値
- models loading / error / loadedの状態分離
- 利用不可modelのID・表示・案内・入力停止
- 利用不可時のモデル再選択と送信再開
- 正規modelの既存表示・会話保存・チャット送信

### Live Tests

- 正規26モデルを固定順で直列実行
- 各1リクエスト、512 tokens以下、120秒でfetch中断、自動retryなし
- 空でない本文とprotocol固有完了マーカーを確認
- 一部失敗後も継続し、最後に集約
- 本文・キー・request / upstream error body非出力

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| 公式表と`/v1/models`が一致しない | Endpoints表を明示的な正とし、対象外7件をcontract testで除外する |
| モデル追加時にrouting表と公開一覧がずれる | 公開ModelInfoとprotocolを単一カタログで管理する |
| Messagesのevent形式差で本文やReasoningが欠落する | protocol固有fixtureでtext / thinking / stop / errorを固定する |
| Messagesの認証headerやbody形式を誤る | URL、`x-api-key`、`anthropic-version`、bodyをfixture contract testで固定する |
| 完了前EOFを成功扱いして未完了回答を採用する | protocol固有完了マーカーだけを成功とし、EOFを未完了エラーにする |
| timeout後もfetchが残り次モデルと重なる | AbortSignalを全fetchへ渡し、中断したstreamの終了を待つ |
| 未知modelがChat Completionsへ誤送信される | 未知model / protocolをfallbackせず、Backend境界で拒否する |
| 409前にuserメッセージだけ保存される | model検証をメッセージ作成より前に配置し、件数でintegration testする |
| models取得失敗をモデル廃止と誤表示する | loading / error / loadedを分離し、loaded後だけ利用不可判定する |
| live testが課金やrate limitを増やす | 直列・各1回・512 tokens上限・retryなし・明示実行に限定し、短文回答を指定する |
| live testが秘密や回答を漏らす | 出力項目をallowlist化し、上流errorを分類へ変換する |
| Museへ機密情報を送る | 固定非機密プロンプトだけをlive testで使用し、モデル説明に公式注意を含める |
| 期間限定モデルが終了する | 失敗を隠さず、公式表更新時にカタログ変更として扱う |

## Deliverables

- [x] `specs/000_backlog/items/P2-011-opencode-go-models.md`
- [x] `specs/009-opencode-go-models/spec.md`
- [x] `specs/009-opencode-go-models/plan.md`
- [x] 正規26モデルの単一カタログ
- [x] Responses / Chat Completions / Messages adapter
- [x] Backend model validationと利用不可model 409
- [x] Frontend利用不可model状態
- [x] 通常テストから隔離したlive test harness
- [x] 全26モデルの実API疎通結果
- [x] README・MVP仕様・P3-007同期
