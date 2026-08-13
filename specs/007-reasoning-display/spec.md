# Feature Specification: Reasoning モデルの Thinking コンテンツ表示

**Feature Branch**: `[007-reasoning-display]`

**Created**: 2026-08-13

**Status**: Draft

**Input**: [P1-007 backlog item](../000_backlog/items/P1-007-reasoning-display.md)

> **現行構成に関する注記:** 現行バックエンドは Azure Functions (`functions/`) であり、本機能もFunctionsのみを対象とする。旧Expressバックエンド (`backend/`) は本機能の実装時に削除する。過去のMVP仕様書・移行履歴にあるExpressの記述は履歴として保持し、現行のREADME・セットアップ手順のみ更新する。

## User Scenarios & Testing

### User Story 1 - 思考プロセスと最終回答の分離表示 (Priority: P1)

Reasoning対応モデルが返す思考プロセスと最終回答を、ユーザーが区別して読める。思考プロセスは補助情報として折りたたまれ、最終回答は常に表示される。

**Why this priority**: 現在は思考プロセスと最終回答が一つのテキストとして表示され、回答の可読性を損なっているため。

**Independent Test**: Reasoningフィールドを含むSSEをモックし、思考部分が折りたたみ表示され、最終回答が常に表示されることを確認できる。

**Acceptance Scenarios**:

1. **Given** assistant応答にReasoningが含まれる状態、**When** 応答が表示される、**Then** 思考プロセスと最終回答が別々の領域に表示される
2. **Given** Reasoning表示が初期状態である、**When** ユーザーがメッセージを表示する、**Then** 思考部分は折りたたまれ、「🤔 思考プロセス（N文字）」のラベルだけが表示される
3. **Given** 思考部分が折りたたまれている状態、**When** ユーザーがラベルをクリックする、**Then** 思考全文が展開され、再度クリックすると折りたたまれる
4. **Given** Reasoningが存在しないassistant応答、**When** 応答が表示される、**Then** Reasoning用UIは表示されず、従来の回答表示になる
5. **Given** Reasoningだけが存在し最終回答が空の応答、**When** 応答が表示される、**Then** 思考部分は表示され、空の回答ブロックは表示されない

### User Story 2 - ストリーミング中の分離表示 (Priority: P1)

Reasoningと最終回答がストリーミング中も別々に蓄積され、リアルタイムに表示される。

**Independent Test**: Reasoningチャンクとcontentチャンクを交互に返すFunctions SSEをモックし、両方がそれぞれの領域へ逐次追加されることを確認できる。

**Acceptance Scenarios**:

1. **Given** Reasoningチャンクを受信している状態、**When** ストリーミングが継続する、**Then** 思考領域だけが更新され、最終回答領域へ混入しない
2. **Given** contentチャンクを受信している状態、**When** ストリーミングが継続する、**Then** 最終回答領域だけが更新され、思考領域へ混入しない
3. **Given** 同一の上流チャンクにReasoningとcontentの両方が含まれる状態、**When** FunctionsがSSEを返す、**Then** 両方の内容が失われず、それぞれの状態へ蓄積される
4. **Given** ストリーミング中にユーザーが思考領域を展開した状態、**When** 次のチャンクを受信する、**Then** 展開状態を維持する

### User Story 3 - Reasoningの保持と再表示 (Priority: P1)

完了したassistant応答のReasoning全文がメッセージに保存され、会話を再読み込みした後も折りたたみ表示できる。

**Independent Test**: Reasoningを含むassistantメッセージを保存し、会話を再取得してReasoningが復元されることを確認できる。

**Acceptance Scenarios**:

1. **Given** Reasoningを含む応答が正常完了した状態、**When** assistantメッセージを保存する、**Then** 最終回答とReasoningが別フィールドで保存される
2. **Given** Reasoningを保存した会話が存在する状態、**When** ページを再読み込みする、**Then** Reasoningが折りたたまれた状態で復元される
3. **Given** 過去のReasoningなしメッセージが存在する状態、**When** メッセージを表示する、**Then** 既存データの表示が壊れない
4. **Given** 保存済みメッセージを次のチャット履歴として送信する状態、**When** FunctionsがOpenCode Goへリクエストする、**Then** 最終回答だけが送信され、Reasoning全文は再送されない

### User Story 4 - LLM形式の違いへの対応 (Priority: P1)

OpenCode Go経由のモデルが異なるReasoning形式を返しても、Functionsが共通形式へ正規化して同じUIで表示する。Reasoningを認識できない形式でも、通常の回答表示は壊れない。

**Independent Test**: 複数のChat Completions形式、Responses API形式、content内マーカー形式を入力し、共通のReasoning/content結果へ変換できることを確認できる。

**Acceptance Scenarios**:

1. **Given** `delta.reasoning_content`を返すモデル、**When** SSEを処理する、**Then** 値がReasoningとして表示・保存される
2. **Given** `delta.reasoning`を返すモデル、**When** SSEを処理する、**Then** 値がReasoningとして表示・保存される
3. **Given** `delta.thinking`、`delta.thought`、`delta.analysis`など正規化テーブルに登録されたフィールドを返すモデル、**When** SSEを処理する、**Then** 値がReasoningとして表示・保存される
4. **Given** Responses APIのReasoning/Thinking系イベントを返すモデル、**When** SSEを処理する、**Then** テキストがReasoningとして表示・保存される
5. **Given** `<think>...</think>`、`<thinking>...</thinking>`、`<analysis>...</analysis>`で思考を返すモデル、**When** ストリーミングを処理する、**Then** マーカー内部がReasoning、外部が最終回答として表示される
6. **Given** マーカーが複数のネットワークチャンクに分割されて届く状態、**When** ストリーミングを処理する、**Then** マーカー境界をまたいでも内容が欠落・混入しない
7. **Given** 未知のReasoning形式または不正なイベント、**When** SSEを処理する、**Then** 既知のcontentは通常回答として表示され、チャット全体は失敗しない
8. **Given** Reasoningを返さないモデル、**When** SSEを処理する、**Then** 既存のcontentストリーミングと同じ表示になる

## Edge Cases

- **Reasoningフィールドが空またはnull**: Reasoningチャンクを生成せず、通常回答として扱う
- **contentとReasoningが同時に存在**: どちらも破棄せず別々に蓄積する
- **Reasoningだけで完了**: Reasoningを保存し、空の最終回答ブロックは表示しない
- **content内のマーカーが閉じられない**: ストリーム終了時に未確定の文字列を失わずにflushする。ストリーム中にReasoningとして既に配信した内容は再分類しない
- **content内にコード例としてマーカーが含まれる**: 正規化対象は明示的に対応するマーカー形式のみとし、未知の文脈を推測して分離しない
- **Responses APIの未知イベント**: 既知のテキストイベント処理を妨げずに無視する
- **上流APIエラー**: 既存のエラーSSEとassistant保存の挙動を維持する
- **ストリーミング停止・ネットワーク切断**: 中間Reasoningの保存は本機能の対象外とし、P1-003で扱う
- **長いReasoning**: 初期表示を折りたたみ、展開時のみ全文を描画する
- **旧データ**: `reasoning`フィールドがないMessageを従来どおり表示する

## Requirements

### Functional Requirements

- **FR-001**: FunctionsはOpenCode Goの上流ストリームを、contentとReasoningを分離した内部共通形式へ変換しなければならない
- **FR-002**: Chat Completionsの`reasoning_content`、`reasoning`および正規化テーブルに登録されたReasoningフィールドをReasoningとして扱わなければならない
- **FR-003**: FunctionsはResponses APIのcontentイベントとReasoning/Thinkingイベントを共通形式へ変換しなければならない
- **FR-004**: Functionsは対応するcontent内マーカーをストリーム境界をまたいで認識し、Reasoningとcontentを分離しなければならない
- **FR-005**: 未知のReasoning形式を受信しても、既知のcontentを通常回答として処理しなければならない
- **FR-006**: Functionsの下流SSEは既存の`content`と`done`を維持し、Reasoningがある場合は任意の`reasoning`フィールドを追加しなければならない
- **FR-007**: FrontendはストリーミングReasoningとストリーミングcontentを別々に状態管理しなければならない
- **FR-008**: FrontendはReasoningをデフォルトで折りたたみ、クリックで展開・再折りたたみできなければならない
- **FR-009**: ReasoningラベルにはReasoningの文字数を表示しなければならない
- **FR-010**: Reasoningが存在しないMessageにはReasoning UIを表示してはならない
- **FR-011**: 正常完了したassistant Messageには最終回答とReasoningを別々に保存しなければならない
- **FR-012**: 既存Messageに`reasoning`がない場合も後方互換で読み取り・表示できなければならない
- **FR-013**: OpenCode Goへ会話履歴を送信する際、保存済みReasoningを送信してはならない
- **FR-014**: `backend/`を削除し、Functionsを唯一のバックエンド実装として維持しなければならない
- **FR-015**: 現行CI/CDからbackendのビルド・テスト依存を削除し、FunctionsとFrontendの検証を継続しなければならない
- **FR-016**: 現行READMEとセットアップ手順から、実行不能となるExpress/backend手順を削除またはFunctions手順へ更新しなければならない

### SSE Contract

既存のSSE形式との互換性を保つため、`content`と`done`は維持し、`reasoning`を任意フィールドとして追加する。

Reasoningのみのチャンク:

```text
data: {"content":"","reasoning":"まず質問を整理します。","done":false}
```

contentのみのチャンク:

```text
data: {"content":"結論として、","done":false}
```

同一チャンクに両方がある場合:

```text
data: {"content":"結論です。","reasoning":"検討した結果、","done":false}
```

完了イベント:

```text
data: {"content":"","done":true}
```

`reasoning`は空文字の場合は省略してよい。`done: true`イベントは1回だけ送信する。

### Key Entities

#### Message

```json
{
  "id": "uuid-string",
  "conversationId": "uuid-string",
  "role": "assistant",
  "content": "最終回答",
  "reasoning": "思考プロセス全文",
  "createdAt": "2026-08-13T00:00:00Z"
}
```

- `reasoning`はassistant Messageに対して任意
- 既存Messageには`reasoning`が存在しない
- user Messageには`reasoning`を保存しない

### Normalization Rules

正規化はモデルIDではなく、上流プロトコルとイベント・フィールドの形で行う。

| 入力 | 正規化先 |
|---|---|
| `choices[].delta.content` | `content` |
| `choices[].delta.reasoning_content` | `reasoning` |
| `choices[].delta.reasoning` | `reasoning` |
| 登録済みの`thinking` / `thought` / `analysis`フィールド | `reasoning` |
| Responses APIのoutput textイベント | `content` |
| Responses APIのReasoning/Thinking系イベント | `reasoning` |
| 対応済み`<think>`等のマーカー内部 | `reasoning` |
| 上記以外の未知イベント | 原則無視。ただし既知のcontent処理は継続 |

Reasoningフィールドが文字列ではなく配列・オブジェクトの場合は、既知のテキスト要素を到着順に抽出する。未知の構造を推測して任意の値を表示しない。

## Success Criteria

### Measurable Outcomes

- **SC-001**: Reasoningを含むChat Completionsの代表的な入力形式3種類以上を、同じFrontend表示へ変換できる
- **SC-002**: Responses APIのcontentイベントとReasoning/Thinkingイベントを、それぞれ正しい領域へ表示できる
- **SC-003**: `<think>`等のマーカーがチャンク境界で分割されても、内容の欠落・混入が発生しない
- **SC-004**: Reasoning非対応モデルの既存SSE表示テストがすべて成功する
- **SC-005**: 正常完了したReasoning全文がCosmos DBへ保存され、再読み込み後に復元される
- **SC-006**: OpenCode Goへの次回リクエストにReasoningが含まれないことをテストで確認できる
- **SC-007**: FunctionsとFrontendのbuild・unit testが成功し、backend依存がCIからなくなる
- **SC-008**: Reasoning表示は初期状態で折りたたまれ、キーボード操作可能なボタンとして機能する

## Out of Scope

- ストリーミング中断・ネットワーク切断時の中間Message保存（P1-003）
- OpenCode Go以外のAPIプロバイダーを直接接続する機能
- 未知の任意フィールドを推測してReasoningと判定する機能
- Reasoningの編集、削除、エクスポート機能
- Reasoningを次のLLMリクエストへコンテキストとして再送する機能
- ダークモード全体対応（P3-001）
- 230秒を超えるストリーミング方式の変更

## Assumptions

- OpenCode GoはChat CompletionsまたはResponses APIを通じて利用可能なモデルを提供する
- 現行本番バックエンドはAzure Functionsであり、FrontendとFunctionsを同時に更新できる
- Cosmos DBはスキーマレスであり、既存Messageに`reasoning`がなくても後方互換で読み取れる
- Reasoningの文字数はFrontendで表示用に計算し、保存時に別途文字数を保持しない
- 過去のMVP仕様書・移行履歴は履歴として保持し、現行運用手順のみFunctionsへ統一する
