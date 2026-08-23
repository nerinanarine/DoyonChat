# Feature Specification: OpenCode Go公式モデルカタログ更新

**Feature Branch**: `[009-opencode-go-models]`

**Created**: 2026-08-22

**Status**: Implemented and deployed

**Input**: [P2-011 backlog item](../000_backlog/items/P2-011-opencode-go-models.md)

**Authoritative Source**: [OpenCode Go公式Endpoints表](https://dev.opencode.ai/docs/go/)（2026-08-22確認）

> **対象の定義:** 公式ページの「Endpoints」表に掲載された23モデルをDoyonChatの正規モデルとする。`GET https://opencode.ai/zen/go/v1/models`が返す29件を実行時に自動採用せず、表にない6件は本機能の対象外とする。

## User Scenarios & Testing

### User Story 1 - 公式23モデルを選択してチャットする (Priority: P2)

ユーザーはOpenCode Go公式Endpoints表に掲載された23モデルから任意のモデルを選択し、会話単位で保存してテキストチャットできる。

**Why this priority**: 現行カタログは公式表の一部だけを提供し、上流APIもChat Completionsと一部Responsesに限定されているため、新しいモデルを選択しても正しいプロトコルでチャットできる状態を保証する必要がある。

**Independent Test**: `GET /api/models`から23件を取得し、各モデルを会話へ設定する。モデルごとの正規プロトコルへリクエストされ、ストリーム本文が既存チャットUIへ表示されることを確認できる。

**Acceptance Scenarios**:

1. **Given** モデル一覧を取得できる状態、**When** モデル選択UIを開く、**Then** 正規23モデルが重複なく安定した順序で表示される
2. **Given** 任意の正規モデルを選択した状態、**When** 会話を再読み込みする、**Then** 保存したモデルが再選択される
3. **Given** Responsesモデルを選択した状態、**When** メッセージを送信する、**Then** `POST /v1/responses`のストリームが利用される
4. **Given** Chat Completionsモデルを選択した状態、**When** メッセージを送信する、**Then** `POST /v1/chat/completions`のストリームが利用される
5. **Given** Messagesモデルを選択した状態、**When** メッセージを送信する、**Then** `POST /v1/messages`のストリームが利用される
6. **Given** いずれかの正規モデルから本文とReasoningが届く状態、**When** ストリームを受信する、**Then** 本文とReasoningが既存の共通チャンク形式へ正規化される
7. **Given** 新規会話を作成する状態、**When** Frontendがmodelを省略して作成APIを呼ぶ、**Then** Backend既定値の`kimi-k2.6`が保存される

### User Story 2 - 利用不可モデルを保持した会話を安全に扱う (Priority: P2)

ユーザーは、将来カタログから削除されたモデルIDを保持する既存会話の履歴を引き続き閲覧できる。利用可能なモデルを再選択するまで、新しいメッセージは送信されない。

**Why this priority**: 保存済みモデルが一覧にない場合に先頭モデル名を表示しながら別のモデルIDを上流へ送る不整合と、ユーザーメッセージだけが保存される部分更新を防ぐため。

**Independent Test**: 正規23件にないモデルIDを持つ会話を読み込み、保存IDと「利用不可」が表示され、入力・送信が停止されることを確認する。正規モデルへ変更後は送信可能になることを確認できる。

**Acceptance Scenarios**:

1. **Given** 利用不可モデルを保持する既存会話、**When** 会話を開く、**Then** タイトルと既存メッセージは通常どおり表示される
2. **Given** 利用不可モデルを保持する既存会話、**When** モデル表示を確認する、**Then** 先頭モデルへフォールバックせず保存済みIDと「利用不可」が表示される
3. **Given** 利用不可モデルを保持する既存会話、**When** メッセージを送信しようとする、**Then** 入力・送信が停止され、現行モデルの再選択を促す案内が表示される
4. **Given** 利用不可モデルを保持する既存会話、**When** 正規23モデルのいずれかへ変更する、**Then** 新しいモデルが保存され、チャット送信が再開できる
5. **Given** 利用不可モデルの会話へAPIを直接送信する状態、**When** chat APIを呼ぶ、**Then** 409が返り、新しいuserメッセージは保存されない
6. **Given** モデル一覧が読み込み中または取得失敗した状態、**When** 会話を表示する、**Then** 一時状態を利用不可モデルと誤判定しない

### User Story 3 - 全23モデルの実API疎通を安全に確認する (Priority: P2)

開発者は、通常テストとCIから分離されたlive testを明示実行し、公式23モデルすべてで実際のテキストチャットが完了することを確認できる。

**Why this priority**: mock testだけでは、モデル提供状況、正しいエンドポイント、実際のSSEイベント形式を保証できないため。

**Independent Test**: 実APIキーをローカル設定し、専用コマンドを1回実行する。23モデルを直列に1リクエストずつ呼び、各モデルで空でない回答本文と正常完了を確認し、23/23の結果を得られる。

**Acceptance Scenarios**:

1. **Given** 実APIキーと明示的なlive testコマンド、**When** テストを実行する、**Then** 正規23モデルがそれぞれ1回ずつ直列実行される
2. **Given** 各モデルのlive test、**When** 正常応答を受信する、**Then** 空でない回答本文を1回以上受信し、ストリーム完了へ到達した場合だけ成功となる
3. **Given** 一部モデルが失敗した状態、**When** live testを続行する、**Then** 残りのモデルも検証され、最後に失敗モデルが集約される
4. **Given** timeout、429、HTTPエラー、SSEエラー、本文なし、未完了のいずれか、**When** 判定する、**Then** 成功として扱わない
5. **Given** 通常の`npm test`またはCI、**When** テストを実行する、**Then** 実APIリクエストは発生しない
6. **Given** live testのログ、**When** 成否を出力する、**Then** APIキー、Authorization、request body、回答本文、上流error bodyは出力されない

## Canonical Model Catalog

| Protocol | Display Name | Model ID |
|---|---|---|
| Responses | Grok 4.5 | `grok-4.5` |
| Responses | GPT 5.6 Luna | `gpt-5.6-luna` |
| Responses | Muse Spark 1.2 Contributor | `muse-spark-1.2-contributor` |
| Chat Completions | GLM-5.3 | `glm-5.3` |
| Chat Completions | GLM-5.2 | `glm-5.2` |
| Chat Completions | GLM-5.1 | `glm-5.1` |
| Chat Completions | Kimi K3 | `kimi-k3` |
| Chat Completions | Kimi K2.7 Code | `kimi-k2.7-code` |
| Chat Completions | Kimi K2.6 | `kimi-k2.6` |
| Chat Completions | DeepSeek V4 Pro | `deepseek-v4-pro` |
| Chat Completions | DeepSeek V4 Flash | `deepseek-v4-flash` |
| Chat Completions | DeepSeek V4 Flash Vision Exp | `deepseek-v4-flash-vision-exp` |
| Chat Completions | MiMo-V2.5 | `mimo-v2.5` |
| Chat Completions | MiMo-V2.5-Pro | `mimo-v2.5-pro` |
| Chat Completions | Hy3 | `hy3` |
| Chat Completions | Ox Alpha Free | `ox-alpha-free` |
| Messages | MiniMax M3 | `minimax-m3` |
| Messages | MiniMax M2.7 | `minimax-m2.7` |
| Messages | MiniMax M2.5 | `minimax-m2.5` |
| Messages | Qwen3.8 Max | `qwen3.8-max` |
| Messages | Qwen3.7 Max | `qwen3.7-max` |
| Messages | Qwen3.7 Plus | `qwen3.7-plus` |
| Messages | Qwen3.6 Plus | `qwen3.6-plus` |

Contract counts:

- Responses: 3
- Chat Completions: 13
- Messages: 7
- Total: 23
- Model ID duplicates: 0
- Default model: `kimi-k2.6`

The following six IDs returned by `/v1/models` are not present in the official Endpoints table and are excluded: `kimi-k2.5`, `glm-5`, `qwen3.5-plus`, `mimo-v2-pro`, `mimo-v2-omni`, `hy3-preview`.

### Public Metadata Policy

- 既存18モデルの公開メタデータは、明示的な公式情報と矛盾しない限り維持する
- 新規5モデルの`name`は公式表の表記に合わせ、推測に基づく性能・速度・context・料金情報を作らない
- 新規モデルの`quality`は中立値`3`、公式根拠がない`speed`と`contextLength`は`Unknown`、`cost`は`See OpenCode Go`とする
- 新規5モデルの`bestFor`はすべて`General use`とする。GLM-5.3、DeepSeek V4 Flash Vision Exp、MiniMax M2.5の`description`は`OpenCode Go model`、Museは`OpenCode Go model. Regional restrictions apply; prompts and outputs may be used for training.`、Ox Alpha Freeは`OpenCode Go model. Limited-time availability.`とする
- `supportsMultimodal`は、公式ページが画像入力を明示する`deepseek-v4-flash-vision-exp`だけを`true`とし、他の新規4モデルは`false`とする
- Museの説明へ公式上の地域制限とプロンプト・出力の学習利用を、Ox Alpha Freeの説明へ期間限定であることを含める

## Edge Cases

- **公式ページと`/v1/models`の差異**: 公式Endpoints表を優先し、実行時レスポンスでカタログを自動変更しない
- **公式表の将来変更**: コード・テスト・READMEを同じ変更で明示更新し、実API疎通を再実行する
- **未知modelを指定した作成・更新**: Backendで400を返し、保存しない
- **利用不可modelを持つ既存会話**: DB値を自動変更・削除せず、履歴閲覧とモデル再選択だけを許可する
- **一覧読み込み中・取得失敗**: 利用不可状態とは分離し、誤って送信停止理由をモデル廃止と表示しない
- **未知protocol**: Chat Completionsへ暗黙フォールバックせず、設定エラーとして失敗させる
- **SSEがHTTP 200のままerror eventを返す**: 正常完了にせずエラーとして扱う
- **SSEが完了イベント前にEOFとなる**: 未完了ストリームとして失敗させ、EOF自体を正常完了にしない
- **Reasoningだけ受信して本文が空**: UIストリームではReasoningを表示できるが、live testは本文なしとして失敗させる
- **レート制限**: 429を失敗として記録し、自動retryしない
- **timeout**: `AbortController`で実際の上流fetchを中断し、中断完了後に次のモデルへ進む
- **Messagesモデルへの新規画像送信**: userメッセージ保存前に400で拒否する
- **既存の画像付き履歴をMessagesモデルで送る場合**: 保存済み履歴を変更せず、上流Messages requestへはtext partだけを送る。画像だけで空contentになる過去メッセージはrequestから除外する
- **Museの地域・データ利用制約**: 非機密の固定live testプロンプトだけを送り、モデル説明で公式上の注意を示す
- **Ox Alpha Freeの期間終了**: live testで失敗を検知し、公式表から削除された時点で別変更としてカタログを更新する

## Requirements

### Catalog Requirements

- **FR-001**: Functionsは公開用モデル情報と内部protocolを1つの静的カタログで管理しなければならない
- **FR-002**: `GET /api/models`は正規23モデルを重複・過不足なく返さなければならない
- **FR-003**: モデルの表示順は固定し、同じbuildでは変動してはならない
- **FR-004**: 既定モデルは`kimi-k2.6`を維持しなければならない
- **FR-005**: protocolはBackend内部情報とし、Frontend向けModelInfoへ公開することを必須としない
- **FR-006**: `/v1/models`を利用して実行時にモデルを自動追加・削除してはならない
- **FR-007**: 既存18モデルの公開メタデータは、公式情報との修正が必要な項目を除き維持しなければならない
- **FR-008**: Museの説明は地域制限とプロンプト・出力の学習利用を、Ox Alpha Freeの説明は期間限定であることを示さなければならない

### Protocol Requirements

- **FR-009**: Responsesモデルは`POST https://opencode.ai/zen/go/v1/responses`を使用しなければならない
- **FR-010**: Chat Completionsモデルは`POST https://opencode.ai/zen/go/v1/chat/completions`を使用しなければならない
- **FR-011**: Messagesモデルは`POST https://opencode.ai/zen/go/v1/messages`を使用しなければならない
- **FR-012**: protocol選択はモデルIDの文字列規則ではなく、静的カタログのprotocol属性に基づかなければならない
- **FR-013**: 3プロトコルのイベントは`{ content, reasoning?, done }`の共通チャンク形式へ正規化しなければならない
- **FR-014**: 各protocolの本文deltaとReasoning/thinking deltaを可能な範囲で分離しなければならない
- **FR-015**: HTTPエラー、protocol固有error event、JSONとして解釈できない必須イベントを正常完了として扱ってはならない
- **FR-016**: `done: true`はChat Completionsの`[DONE]`、Responsesの`response.completed`、Messagesの`message_stop`だけが生成し、完了前のEOFは未完了エラーにしなければならない

### Model Validation Requirements

- **FR-017**: Frontendは新規会話作成時にmodelを送らず、Backendはmodelが省略された場合に`kimi-k2.6`を保存しなければならない
- **FR-018**: 会話作成とモデル変更は正規23モデルだけを受理し、modelが存在するが文字列でない場合と未知modelを400で拒否しなければならない
- **FR-019**: chat送信時もConversationのmodelをカタログと照合しなければならない
- **FR-020**: 利用不可モデルを保持する既存Conversationのmodel値、タイトル、メッセージを自動変更してはならない
- **FR-021**: 利用不可モデルの会話へのchat送信は409で拒否し、userメッセージを保存してはならない
- **FR-022**: Frontendは利用不可モデルを先頭モデル名へフォールバック表示してはならない
- **FR-023**: Frontendは保存済みmodel IDと「利用不可」、再選択案内を表示し、chat入力・送信を停止しなければならない
- **FR-024**: Frontendは利用不可状態でもモデル選択を許可し、正規モデルの保存成功後に送信を再開しなければならない
- **FR-025**: Frontendはモデル一覧のloading、取得失敗、利用不可modelを別々の理由として表示して送信を停止し、一覧の読み込み成功後だけ利用不可modelを判定しなければならない

### Live Test Requirements

- **FR-026**: live testは通常Jestのroots外に置き、専用設定と明示的なnpm scriptからだけ実行されなければならない
- **FR-027**: live testは`OPENCODE_GO_API_KEY`をprocess environmentまたはGit除外済み`functions/local.settings.json`から読み込まなければならない
- **FR-028**: APIキーが未設定またはテンプレート値の場合、実APIを呼ぶ前に明示的に停止しなければならない
- **FR-029**: live testは23モデルを直列に各1リクエスト、自動retryなしで実行しなければならない
- **FR-030**: 固定プロンプトは非機密の短文とし、Reasoningが本文を圧迫しないよう出力上限を512 tokens以下にしなければならない
- **FR-031**: 各モデルは120秒で`AbortController`を発火し、上流fetchの中断完了後に次モデルへ進み、timeoutを成功として扱ってはならない
- **FR-032**: 一部モデルの失敗後も残りを実行し、最後に失敗モデルを集約しなければならない
- **FR-033**: 成功には空でない本文deltaの受信と正常完了の両方が必要である
- **FR-034**: ログはmodel ID、protocol、成否、所要時間、サニタイズ済みエラー分類だけを出力しなければならない
- **FR-035**: APIキー、Authorization、request body、回答本文、上流error bodyをログへ出力してはならない
- **FR-036**: 通常の`npm test`、CI、deploy testはlive testを検出・実行してはならない

### Documentation Requirements

- **FR-037**: READMEのモデル表・外部API説明・live test手順を正規23モデルと3プロトコルへ同期しなければならない
- **FR-038**: `specs/001-chat-app/spec.md`と`plan.md`の単一Chat Completions前提および旧モデル表を更新しなければならない
- **FR-039**: 実API疎通完了後、P3-007へP2-011で実施済みの参照を追記しなければならない

### Additional Protocol Requirements

- **FR-040**: Messages requestは`Content-Type: application/json`、`x-api-key: <OPENCODE_GO_API_KEY>`、`anthropic-version: 2023-06-01`を送り、bodyを`{ model, messages, max_tokens, stream: true }`形式にしなければならない
- **FR-041**: Messagesモデルでは新規画像送信を保存前に400で拒否し、既存履歴に画像partがある場合は保存内容を変更せずtext partだけを上流へ送り、画像だけで空contentになる過去メッセージはrequestから除外しなければならない
- **FR-042**: 上流stream呼び出しは任意の`AbortSignal`を受け取り、3protocolすべてのfetchへ渡さなければならない

## API Behavior

### Public Model List

```http
GET /api/models
```

- 200: 公開用ModelInfoの配列。正規23件、ID一意、固定順序
- protocolは内部ルーティング用であり、レスポンスへ含めなくてよい

### Unknown Model on Create or Update

- `POST /api/conversations`で未知modelが指定された場合: 400
- `POST /api/conversations`でmodelが存在するが文字列でない場合: 400
- `PUT /api/conversations/{id}/model`で未知modelが指定された場合: 400
- `PUT /api/conversations/{id}/model`でmodelが存在するが文字列でない場合: 400
- どちらもConversationへ未知modelを保存しない

### Unavailable Existing Model on Chat

```http
POST /api/chat
```

- Conversationが保持するmodelが正規カタログにない場合: 409
- エラー形式: `{ "error": "Selected model is no longer available" }`
- userメッセージ、assistantメッセージを保存しない

## Live Test Contract

```bash
cd functions
npm run test:live:models
```

- 実行は開発者の明示操作とみなす
- `functions/local.settings.json`はGit除外済みであり、APIキーをcommitしない
- prompt: `Reply only OK`
- max output: 512 tokens
- per-model timeout: 120 seconds
- timeout action: `AbortController`で上流fetchを中断し、中断完了後に次モデルを実行
- concurrency: 1
- automatic retries: 0
- success: non-empty final content and protocol固有の正常完了マーカー（`[DONE]` / `response.completed` / `message_stop`）

## Success Criteria

- **SC-001**: 正規モデルIDが23件で一意であり、protocol件数が3 / 13 / 7である
- **SC-002**: `GET /api/models`とFrontendモデル選択UIに23件が重複なく表示される
- **SC-003**: 各モデルが正規protocolへルーティングされることをmock testで固定する
- **SC-004**: 3プロトコルの本文・Reasoning・完了・エラーイベントが共通形式へ正規化され、完了マーカー前のEOFは失敗する
- **SC-005**: 未知modelの会話作成・モデル変更が400となり、保存されない
- **SC-006**: 利用不可モデルを保持する既存会話は閲覧でき、送信はメッセージ保存前に409となる
- **SC-007**: 利用不可表示、送信停止、再選択後の送信再開がFrontend testで確認される
- **SC-008**: 専用live testで23/23モデルが空でない本文と正常完了を返す
- **SC-009**: 通常テスト・CIは実APIを呼ばず、live testログに機密情報・本文が含まれない
- **SC-010**: Functions / Frontendの既存testとbuildが成功し、今回の差分に起因するlint警告がない
- **SC-011**: README、MVP仕様、バックログが実装後のモデルカタログと一致する
- **SC-012**: live testのtimeoutが実際の上流fetchを中断し、中断完了前に次モデルを開始しない
- **SC-013**: Messages requestのURL、headers、body、text-only変換がfixture contract testで確認される

## Out of Scope

- `/v1/models`レスポンスによる実行時カタログ同期
- 公式Endpoints表にない6モデルの提供
- モデル料金や利用上限の動的取得・表示
- 画像アップロードUIやマルチモーダル入力の新規実装
- Museの地域制限をIPやアカウント情報から事前判定する機能
- 自動retry、並列live test、定期的な課金APIテスト
- P3-007が担当するプロジェクト全体のカバレッジ80%達成

## Assumptions

- OpenCode Go公式Endpoints表をモデルIDとprotocol割当の正とする
- 公式表は将来変更されるため、更新はコード・テスト・ドキュメント・live testを同じ変更単位で行う
- 現行18モデルは正規23件の部分集合であり、今回追加するモデルは5件である
- 既定モデル`kimi-k2.6`は正規23件に含まれるため変更しない
- 実APIキーはユーザーがローカルへ設定し、チャットやGit管理ファイルへ貼り付けない
