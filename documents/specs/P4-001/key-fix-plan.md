# P4-001: ローカルデバッグ用APIキー受け渡し修正計画（キー受け渡し）

本計画は `spec.md` の受け入れ条件「ローカルデバッグ時に API キーを正しく受け渡す」を満たすための作業手順。対応backlog: documents/specs/000_backlog/items/P4-001-ui-refactoring.md に含める (ユーザー確定済み)。前提: P4-001/plan.md のローカル起動整備完了後。着手前に前提の完了を確認する。

## Phase 0: 設定箇所と起動経路の確認

- [ ] gateway (`agent`) が pi 用キーとして `OPENCODE_API_KEY` を読み取る箇所と、ローカル起動手順を確認する。
- [ ] functions がタイトル生成用キーとして `OPENCODE_GO_API_KEY` を読み取る箇所を確認する。
- [ ] `functions/local.settings.json` の `Values` と `functions/local.settings.json.example` の記述を照合する。
- [ ] キーの用途・設定場所・各サービスへの渡し方を区別して記録する。

**検証方法:** `agent/src/server.ts`、`functions/src/services/opencodeGo.ts`、`functions/src/functions/conversations.ts` とローカル設定例を確認し、実際の読込名と起動経路が一致していることを確認する。秘密値はログ・文書・コミットへ出力しない。

## Phase 1: ローカルキー設定とgateway起動

- [ ] gateway起動時に pi 用の有効な `OPENCODE_API_KEY` がプロセス環境へ渡る手順を明確にする。
- [ ] PowerShellでの設定例を含め、`agent` ディレクトリから起動する手順を記載する。
- [ ] 設定漏れ時に pi が `No API key` で拒否することを踏まえ、キー未設定・無効時の確認方法を記録する。

**検証方法:** キー値そのものを表示せず、設定済み環境でgatewayを起動して疎通を確認する。未設定時のエラーがキー未設定に由来することをログの機密情報を伏せて確認する。

## Phase 2: functionsのキー設定とタイトル生成確認

- [ ] `functions/local.settings.json` の `Values` に有効な `OPENCODE_GO_API_KEY` が設定されていることを確認する。
- [ ] functions起動プロセスに設定が読み込まれることを確認する。
- [ ] ローカルUIから会話を作成し、タイトル生成が成功することを確認する。
- [ ] 未設定・無効キー時の失敗を、通常の成功確認と区別して記録する。
- [ ] 現状はタイトル生成が OpenCode Go の 401 で失敗している前提とし、有効キーへ差し替えた後に解消することを確認する。

**検証方法:** キー値は出力せず、会話作成後のタイトル生成結果とfunctionsログを確認する。未設定・無効キー時はタイトル生成が503になることを確認し（`functions/src/functions/conversations.ts:127`）、有効キー設定後はタイトル生成が完了することを確認する。

## Phase 3: 受け入れ確認

- [ ] gateway向け `OPENCODE_API_KEY` とfunctions向け `OPENCODE_GO_API_KEY` が別用途の設定として正しく渡される。
- [ ] 両キーを設定したローカル構成でUIを利用し、agent応答およびタイトル生成を確認する。
- [ ] 手順・結果に秘密値が含まれていないことを確認する。

**検証方法:** gatewayとfunctionsを起動し、UIから会話作成・メッセージ送信・タイトル生成を実行して、両キーが別用途で正しく渡ることを確認する。確認結果と手順を記録し、秘密値が含まれていないことを確認する。

**完了条件:** ローカルで両サービスがそれぞれのキーを受け取り、キー未設定に起因する `No API key` やタイトル生成失敗がなく、機密値を漏らさず確認結果を記録できる。
