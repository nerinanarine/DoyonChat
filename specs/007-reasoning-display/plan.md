# Implementation Plan: Reasoning モデルの Thinking コンテンツ表示

**Branch**: `[007-reasoning-display]` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

**Input**: [Feature specification](./spec.md)

## Summary

OpenCode Go経由のReasoning対応モデルについて、思考プロセスと最終回答をFunctionsで正規化し、Frontendで別々に表示する。Reasoningはassistant Messageの任意フィールドとしてCosmos DBへ保存し、会話再読み込み後も折りたたみ表示する。

モデルIDごとの分岐は行わない。Chat Completionsの複数のReasoningフィールド、Responses APIのイベント、content内の明示的な`<think>`系マーカーを、Functions内の共通形式へ変換する。未知形式は無理に推測せず、既知のcontentを通常回答として処理する。

本機能では旧Expressバックエンドを削除し、Functionsを唯一のバックエンド実装とする。

## Technical Context

**Runtime**: Node.js 20, Azure Functions programming model v4

**Frontend**: React 18, Vite, TypeScript, Tailwind CSS, Vitest

**Backend**: Azure Functions (`functions/`) のみ。旧Express (`backend/`) は削除する。

**Database**: Azure Cosmos DB SQL API

- `conversations` partition key: `/id`
- `messages` partition key: `/conversationId`
- 既存コンテナーと既存Messageを再利用
- スキーマ移行・全件更新は行わない

**External API**: OpenCode Go

- Chat Completions SSE
- Responses API SSE
- APIキーはFunctionsで管理

**Testing**: Jest（Functions）、Vitest（Frontend）

**Constraints**:

- P1-006/P2-006で定義済みのFunctions API契約を基本的に維持する
- SSEの`content`と`done`は維持し、`reasoning`を任意追加する
- 中断時の部分保存はP1-003の対象とする
- OpenCode Go以外のプロバイダーは対象外
- 既知の形式だけを正規化し、未知形式でcontentを壊さない

## Design Decisions

### D1. Functionsのみを実装対象とし、旧Expressを削除する

現行本番はFunctionsであり、`backend/`は使用されていない。二重実装を残すとSSE仕様やReasoning対応が分岐するため、`backend/`ディレクトリ、backend用テスト、CIのbackendジョブを削除する。

過去のMVP仕様書・移行履歴は履歴として保持する。READMEと現行セットアップ手順など、現在の利用者が実行する文書はFunctionsのみへ更新する。

### D2. 上流プロトコルとReasoning形式をFunctions内で正規化する

FrontendはLLMごとのフィールド名を知らず、以下の共通チャンクだけを扱う。

```ts
interface NormalizedStreamChunk {
  content: string;
  reasoning: string;
  done: boolean;
}
```

`reasoning`が空の場合はReasoningなしとして扱う。モデルIDを見て分岐せず、上流イベントの構造で分類する。

### D3. Reasoning正規化処理を独立サービスに分離する

`functions/src/services/reasoningNormalizer.ts`を新規作成し、以下を担当させる。

- Chat CompletionsのReasoningフィールド別名の抽出
- 文字列・配列・既知の構造化テキストの抽出
- `<think>`、`<thinking>`、`<analysis>`のストリーム境界対応
- unknown形式の安全なfallback

Responses APIのイベント種別判定は`opencodeGo.ts`に置き、抽出処理は正規化サービスへ委譲する。新しいフィールド別名を追加する場合、Frontend・DB・SSE契約を変更せずに正規化テーブルだけを更新できるようにする。

### D4. 下流SSEは既存契約の加法拡張とする

FunctionsからFrontendへは次の形式を返す。

```ts
interface ChatSseEvent {
  content: string;
  reasoning?: string;
  done: boolean;
}
```

Reasoningチャンクは`reasoning`へ、contentチャンクは`content`へ入れる。両方が同時に存在する場合は両方を保持する。完了イベントは従来どおり`done: true`を1回だけ送信する。

この方式により、P1-006で定義された`content` / `done`契約を維持しながら、Reasoning対応を追加できる。

### D5. content内マーカーは状態を持つ逐次パーサーで処理する

`<think>`などの開始・終了タグがネットワークチャンクで分割される可能性があるため、単純なチャンク単位の正規表現では処理しない。

パーサーは以下の状態を保持する。

- 通常content中
- Reasoning中
- 開始タグ候補を保持中
- 終了タグ候補を保持中

ストリーム終了時に閉じられていないマーカーが残った場合は、内容を失わないことを優先し、保持中の未確定文字列をcontentとしてflushする。ストリーム中にReasoningとして配信済みの内容は再分類しない。

### D6. Reasoningは保存するが、次回LLMリクエストへ送信しない

正常完了したassistant Messageの`reasoning`へ全文を保存する。`formatMessagesForApi`では従来どおり`content`のみをOpenCode Goへ渡す。

Reasoningの文字数はDBに保存せず、FrontendでUnicode文字列から表示用に計算する。

### D7. 未知形式はcontentを優先して保護する

未知のフィールド・イベントをReasoningと推測して表示することはしない。未知イベントは無視し、既知のcontentイベントは処理を継続する。

これにより、新しいモデル形式に未対応でもチャット全体が壊れない。新形式への対応は、正規化テーブルまたはプロトコルパーサーの追加で行う。

### D8. ReasoningのUIは既存MarkdownRendererを再利用する

ReasoningもMarkdownRendererを使って表示し、最終回答と同じMarkdown・コード表現を維持する。表示領域にはReasoning用の背景色・左ボーダー・アイコンを付け、デフォルトは折りたたむ。

## Target Project Structure

### Documentation

```text
specs/007-reasoning-display/
├── spec.md
└── plan.md
```

### Functions

```text
functions/
├── src/
│   ├── functions/
│   │   └── chat.ts                  # 正規化chunkのSSE化、全文蓄積、保存
│   ├── services/
│   │   ├── opencodeGo.ts            # Chat Completions / Responses API読み取り
│   │   ├── reasoningNormalizer.ts    # Reasoning形式の共通化
│   │   └── conversationService.ts   # Message保存（既存サービスを利用）
│   └── types/
│       └── index.ts                 # Message.reasoning等
└── tests/
    ├── unit/
    │   ├── opencodeGo.test.ts
    │   └── reasoningNormalizer.test.ts
    └── integration/
        └── sse.test.ts
```

### Frontend

```text
frontend/
├── src/
│   ├── components/Chat/
│   │   ├── ChatMessage.tsx          # 保存済みReasoning表示
│   │   ├── ChatMessageList.tsx      # ストリーミングReasoning表示
│   │   └── CollapsibleReasoning.tsx # 新規折りたたみUI
│   ├── hooks/
│   │   └── useChat.ts               # Reasoning / content状態分離
│   ├── services/
│   │   └── chatApi.ts               # reasoning付きSSE解析
│   └── types/
│       └── index.ts                 # Message.reasoning
└── tests/unit/
    ├── chatApi.test.ts
    ├── CollapsibleReasoning.test.tsx
    ├── ChatMessage.test.tsx
    └── ChatMessageList.test.tsx
```

## Implementation Phases

### Phase 0: Spec・契約の確定

**Status**: 完了

**Tasks**:

- [x] OpenCode Go経由のモデルのみを対象とすることを確定
- [x] Reasoning全文を保存することを確定
- [x] content内の`<think>`系マーカーを対象に含めることを確定
- [x] 部分保存をP1-003の対象外とすることを確定
- [x] SSEの加法拡張方針を定義
- [x] 既知形式と未知形式のfallback方針を定義

**Verification**:

- [x] `spec.md`の受け入れ条件とSSE契約をレビューする
- [x] P1-006のFunctions SSE契約と矛盾しないことを確認する

### Phase 1: 旧Expressバックエンドの削除

**Files**:

- `backend/`（削除）
- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`
- `README.md`
- `specs/006-user-isolation-functions/setup-guide.md`
- 必要に応じて現行ドキュメントとP1-007関連記載

**Tasks**:

- [x] `backend/`ディレクトリと配下のテスト・設定を削除する
- [x] CIのbackend path filterと`test-backend`ジョブを削除する
- [x] Deploy workflowのbackendテストジョブと依存関係を削除する
- [x] 現行READMEのbackend起動・設定手順を削除し、Functions手順へ統一する
- [x] 現行セットアップガイドの旧Express実行手順を削除または履歴注記へ変更する
- [x] 過去のMVP仕様書・移行履歴は履歴として残す

**Verification**:

- [x] `backend/`が存在しない
- [x] 現行CI/CDがbackendのパス・ジョブ・npmコマンドを参照しない
- [x] READMEと現行セットアップガイドに実行不能なbackend手順が残っていない

### Phase 2: FunctionsのReasoning正規化

**Files**:

- `functions/src/services/reasoningNormalizer.ts`
- `functions/src/services/opencodeGo.ts`
- `functions/src/types/index.ts`
- `functions/tests/unit/reasoningNormalizer.test.ts`
- `functions/tests/unit/opencodeGo.test.ts`

**Tasks**:

- [x] 共通`NormalizedStreamChunk`の型を定義する
- [x] `reasoning_content`、`reasoning`、`thinking`、`thought`、`analysis`の初期マッピングを実装する
- [x] 文字列・配列・既知の構造化テキストを抽出する
- [x] Chat CompletionsのcontentとReasoningを同時に保持する
- [x] Responses APIのcontentイベントを維持する
- [x] Responses APIのReasoning/Thinking系イベントをReasoningへ変換する
- [x] `<think>`、`<thinking>`、`<analysis>`をストリーム境界対応で分離する
- [x] 不明なイベント・形式を安全にfallbackする
- [x] `formatMessagesForApi`がReasoningを送信しないことを維持する

**Verification**:

- [x] contentのみの入力が従来どおり処理される
- [x] Reasoningフィールド各形式がReasoningへ変換される
- [x] contentとReasoningが同一イベントにあっても両方保持される
- [x] 配列・構造化Reasoningのテキスト順序が維持される
- [x] マーカーが複数チャンクに分割されても正しく分離される
- [x] 未知形式でcontentが失われない

### Phase 3: Functions SSEとMessage保存

**Files**:

- `functions/src/functions/chat.ts`
- `functions/src/types/index.ts`
- `functions/src/services/conversationService.ts`
- `functions/tests/integration/sse.test.ts`
- 必要に応じて`functions/tests/unit/conversationService.test.ts`

**Tasks**:

- [x] `Message.reasoning?: string`を追加する
- [x] Reasoning全文をストリーム中に蓄積する
- [x] `reasoning`を含むSSEイベントを出力する
- [x] 正常完了時にReasoningとcontentを別々に保存する
- [x] Reasoningなしの場合は既存保存形式を維持する
- [x] `done: true`を1回だけ送信する
- [x] 上流エラー時の既存挙動を維持する

**Verification**:

- [x] SSEでReasoningとcontentを別々に受信できる
- [x] 完了イベントが1回だけ届く
- [x] DB保存後にReasoningを含むMessageを取得できる
- [x] 既存ReasoningなしMessageを取得・表示できる
- [x] 部分保存を新たに導入していない

### Phase 4: Frontendのストリーミング状態更新

**Files**:

- `frontend/src/types/index.ts`
- `frontend/src/services/chatApi.ts`
- `frontend/src/hooks/useChat.ts`
- `frontend/tests/unit/chatApi.test.ts`

**Tasks**:

- [x] `Message.reasoning?: string`を追加する
- [x] SSEの任意`reasoning`フィールドを解析する
- [x] chunk callbackでcontentとReasoningを別々に通知する
- [x] `useChat`に`streamingReasoning`と`streamingText`を持たせる
- [x] ストリーミング完了後の再読み込みでReasoningを復元する
- [x] ReasoningなしSSEの既存挙動を維持する

**Verification**:

- [x] Reasoningチャンクが`streamingReasoning`だけを更新する
- [x] contentチャンクが`streamingText`だけを更新する
- [x] Reasoningなしのストリームが従来どおり表示される
- [x] SSE完了後に保存済みMessageへ置き換わる

### Phase 5: Reasoning表示UI

**Files**:

- `frontend/src/components/Chat/CollapsibleReasoning.tsx`
- `frontend/src/components/Chat/ChatMessage.tsx`
- `frontend/src/components/Chat/ChatMessageList.tsx`
- `frontend/tests/unit/CollapsibleReasoning.test.tsx`
- `frontend/tests/unit/ChatMessage.test.tsx`

**Tasks**:

- [x] Reasoning折りたたみコンポーネントを作成する
- [x] デフォルト折りたたみを実装する
- [x] クリックによる展開・折りたたみを実装する
- [x] `aria-expanded`等のアクセシビリティ属性を付与する
- [x] 「🤔 思考プロセス（N文字）」ラベルを表示する
- [x] `Brain`または`Sparkles`アイコンを使用する
- [x] 思考領域へ背景色・左ボーダー・文字色を適用する
- [x] 保存済みMessageとストリーミング中の両方で表示する
- [x] Reasoningがない場合はUIを表示しない
- [x] Reasoningの表示に既存MarkdownRendererを再利用する

**Verification**:

- [x] 初期表示でReasoning本文が非表示になる
- [x] ボタン操作で本文が表示・非表示になる
- [x] キーボード操作で展開できる
- [x] 文字数ラベルが表示される
- [x] ReasoningなしMessageに余分な領域が出ない
- [x] 最終回答は常に表示される

### Phase 6: 全体検証とドキュメント整理

**Tasks**:

- [x] Functionsのbuildとunit/integration testを実行する
- [x] Frontendのbuildとunit testを実行する
- [x] lintを実行する（変更ファイルは警告なし。既存ファイルの警告は別課題）
- [x] FunctionsのローカルSSEをFrontendから確認する
- [x] Reasoningあり・なし・マーカー形式を単体・統合テストで確認する
- [x] 現行READMEとセットアップ手順を再確認する
- [x] P1-007バックログの実装メモ・変更履歴を更新する（実装完了時）
- [x] バックログステータスを実装開始時・完了時の手順に従って更新する

**Verification Commands**:

```bash
cd functions
npm ci
npm run build
npm test -- --runInBand

cd ../frontend
npm ci
npm run build
npm test -- --run
npm run lint
```

## Test Strategy

### Functions Unit Tests

- Chat Completions content-only delta
- `reasoning_content` delta
- `reasoning` delta
- `thinking` / `thought` / `analysis` aliases
- contentとReasoningの同時delta
- null、空文字、不正型
- 配列・構造化テキスト
- Responses API content event
- Responses API Reasoning/Thinking event
- completed event
- 未知イベントのfallback
- `<think>`等の単一チャンク分離
- 開始タグ・終了タグのチャンク分割
- 未閉鎖マーカーのflush
- ReasoningがAPI履歴へ再送されないこと

### Functions Integration Tests

- Reasoning付きSSEのイベント内容
- contentとReasoningの蓄積順序
- `done: true`の単一性
- assistant MessageのReasoning保存
- Reasoningなし応答の後方互換性

### Frontend Unit Tests

- SSEのReasoningフィールド解析
- `useChat`のReasoning/content状態分離
- デフォルト折りたたみ
- 展開・再折りたたみ
- 文字数表示
- ReasoningなしMessage
- 保存済みReasoning表示
- ストリーミングReasoning表示
- 最終回答の常時表示

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| LLMごとにReasoningフィールドが異なる | モデルIDではなく正規化テーブルとプロトコルパーサーで対応する |
| 未知形式を誤ってReasoningと判定する | 既知形式だけを認識し、未知形式はcontentを優先する |
| マーカーがネットワークチャンクで分割される | 状態を持つ逐次パーサーで処理する |
| 既存SSEクライアントとの互換性 | `content`と`done`を維持し、`reasoning`を任意追加する |
| ReasoningのDB保存量が増える | 初期表示を折りたたみ、文字数は保存せず表示時に計算する |
| Reasoningが次回プロンプトへ混入する | `formatMessagesForApi`でcontentだけを変換するテストを追加する |
| backend削除でCIが壊れる | backend path filter、job、deploy依存、現行ドキュメントを同じ変更で整理する |
| 過去文書の参照が古く見える | 履歴文書は保持し、現行README・セットアップ手順をFunctionsへ統一する |

## Deliverables

- [x] `specs/007-reasoning-display/spec.md`
- [x] `specs/007-reasoning-display/plan.md`
- [x] FunctionsのReasoning正規化処理
- [x] FunctionsのSSE・Message保存対応
- [x] FrontendのReasoning状態管理と表示UI
- [x] Functions / Frontendのテスト
- [x] 旧`backend/`ディレクトリ削除
- [x] CI/CDと現行ドキュメントのFunctions統一
- [x] P1-007バックログの実装メモ・変更履歴更新
