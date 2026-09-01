# Implementation Plan: ストリーミング中断時の中間保存

**Branch**: `feat/p1-003-p2-003-p2-013` | **Date**: 2026-08-31 | **Spec**: [spec.md](./spec.md)

**Implementation Status**: Backend/Frontend実装と自動テスト完了（functions 140件、frontend 96件）。P1-003の停止方式はJS境界で検証済み。実機クライアント切断（Azureがasync generatorを`return()`で閉じる挙動）の本番確認は未実施。

## Summary

現在の停止処理はFrontendの`AbortController`でSSEを切断し、受信済みの本文・推論を保存せずにstateを消去している。ストリーミングごとの識別子と一度だけ実行するfinalize処理を導入し、停止時点の内容を既存のMessage形式で保存・再表示する。

**Implementation order**: 共有する`useChat` / `chatApi` / `App`の競合を避けるため、本ブランチではP1-003を先に実装・検証し、その後P2-003、最後にP2-013を統合する。

通常完了、ユーザー停止、上流エラーを別状態として扱い、P2-003のエラー処理へ誤って流さない。具体的な停止通知方式は、Azure Functionsのストリーム切断時にGeneratorの終了処理が確実に実行されるかを検証したうえで確定する。

## Technical Context

**Runtime**: Node.js 20, Azure Functions v4

**Frontend**: React 18, Vite, TypeScript

**Persistence**: Azure Cosmos DB / 開発時in-memory fallback、既存`Message`型

**Current seams**:

- `frontend/src/hooks/useChat.ts` が受信済み本文・推論をlocal stateへ保持する
- `frontend/src/services/chatApi.ts` が`AbortController`を返す
- `functions/src/functions/chat.ts` がユーザーメッセージを保存し、ストリーム完了後にアシスタントメッセージを保存する
- `functions/src/services/conversationService.ts` の`addMessage`がMessageを永続化する

**Constraints**:

- ユーザーメッセージを重複保存しない
- 1回の停止操作でアシスタントメッセージを1件だけ確定する
- 通常完了の保存動作を変更しない
- 認証・会話所有権境界を維持する
- Messageの大規模なスキーマ変更は行わない

## Design Decisions

### D1. 生成単位を識別してfinalizeを一度だけ実行する

各ストリームにgeneration/request identifierを持たせ、通常完了・停止・エラーのどの経路からでも同じfinalize処理を通るようにする。finalize済みフラグと識別子を使い、停止と完了の競合でアシスタントメッセージを二重保存しない。

### D2. サーバー側のストリーム終了処理を第一候補とする

Phase 0で、`createResponseStream`の終了処理がAzure FunctionsのAsyncGeneratorとFrontend abortの組み合わせで実行されるかを検証し、Phase 1着手のゲートとする。

- 切断がサーバーへ通知される場合: Generatorの`finally`で受信済み内容をfinalizeし、上流`streamChat`へ連動した`AbortSignal`でOpenCode Goの生成も停止する
- 切断が通知されない場合: Frontendの受信バッファを部分内容の正規の出所とする、generation identifier付きの明示的finalize APIを追加する。停止通知はサーバー側の共有可能なキャンセル状態へ記録し、実行中の上流リクエストを`AbortController`で停止してからfinalizeする。キャンセル状態をインメモリだけに保持しない

どちらの方式でも、停止済みgenerationの通常完了処理は保存をスキップし、部分アシスタントメッセージとの二重保存と上流生成の継続を防ぐ。Phase 0で選択した方式と根拠を実装メモへ記録する。

**Phase 0検証結果（2026-08-31）**: JSのasync generator契約をNodeでの実験と`functions/tests/integration/sse.test.ts`で確認した。`iterator.return()`/`break`でgeneratorを閉じると`finally`が実行され、`finally`内の非同期保存（`service.addMessage`）も完了する。通常完了時はfinalize済みとなり二重保存しない。**暫定採用方式: generator `finally`による部分保存を主方式とする**。`AbortError`は中断、`TimeoutError`はtimeout、その他のDOMExceptionはnetworkとして分類する。Azure Functionsホストが実際にクライアント切断で`return()`を呼ぶか、上流リクエストへキャンセルが連動するかは未検証であり、デプロイ前の実環境検証を必須とする。

### D3. 停止はエラーではなく中断状態として扱う

ユーザー停止による`AbortError`はP2-003のエラー分類へ渡さない。停止後は受信済み本文・推論を確定し、本文・推論が空の場合だけ`(生成が中断されました)`を保存する。

### D4. ユーザーメッセージは既存の保存経路を維持する

`POST /api/chat`開始時のユーザーメッセージ保存を再利用し、停止処理ではユーザーメッセージを追加しない。必要なgeneration identifierはリクエスト単位のメタデータとして扱い、Message本文へ不要な情報を混ぜない。

### D5. 推論内容は本文と同じgenerationへ紐付ける

受信済みの`streamingText`と`streamingReasoning`を同一アシスタントメッセージへ保存する。本文が空でも推論が存在する場合は推論を失わず、中断表示を本文として補う。

## Target Project Structure

```text
specs/P1-003/
├── spec.md
└── plan.md

functions/
├── src/
│   ├── functions/chat.ts                 # 停止・完了・エラーのfinalize
│   ├── services/conversationService.ts   # 必要時の冪等保存補助
│   └── types/index.ts                    # APIメタデータ追加時のみ
└── tests/
    ├── integration/api.test.ts           # 停止・完了・重複保存契約
    └── unit/                             # stream/finalizeの境界テスト

frontend/
├── src/
│   ├── hooks/useChat.ts                  # 中断状態と受信済み内容の保持
│   └── services/chatApi.ts               # abort/cancel契約
└── tests/unit/
    ├── ChatMessageList.test.tsx
    └── chatApi.test.ts
```

## Implementation Phases

### Phase 0: Spec・契約の確定

- [x] `spec.md`を作成しレビューする
- [x] 停止とP2-003のエラー分類の境界を定義する
- [x] 通常完了・停止・エラーの保存責務を定義する
- [ ] Azure Functionsホストの実クライアント切断通知方式を検証し、部分内容の出所・上流キャンセル・共有キャンセル状態を含むD2の方式を確定する

### Phase 1: Generation lifecycleとBackend保存

- [x] generation identifierとfinalize状態を導入する
- [x] 通常完了時の既存アシスタント保存をfinalize処理へ集約する
- [x] 停止時に本文・推論・中断表示を保存する
- [x] 停止と通常完了の競合で二重保存しない
- [x] ユーザー停止を上流エラー本文や通常アシスタント本文として保存しない
- [ ] サーバー側で切断を検知できない場合のみ、部分内容の出所・共有キャンセル状態・上流キャンセルを満たす冪等なfinalize APIを追加する

**Verification**:

- [x] 完全なストリームは従来どおり1件保存される
- [x] 部分ストリームは受信済み内容だけを1件保存する
- [x] 受信前停止は中断表示を1件保存する
- [x] 同一generationのfinalizeを複数回呼んでも1件しか保存されない
- [x] 別ユーザーの会話を保存できない

### Phase 2: Frontend停止・復元

- [x] `useChat`が停止時に受信済み本文・推論を破棄せず確定処理へ渡す
- [x] `AbortError`をユーザー停止として扱い、P2-003のエラーstateへ渡さない
- [x] 停止完了後にストリーミング表示を解除し、保存済み履歴を再読込する
- [x] 停止後に新しいメッセージを送信できる
- [x] 通常完了とエラー時の既存UIを維持する

**Verification**:

- [x] 停止ボタンで部分本文と推論が通常メッセージになる
- [x] 受信前停止で中断表示が表示される
- [x] 停止ボタンの連打でcallback/APIが重複しない
- [x] 停止後の再読込で内容が復元される

### Phase 3: Automated tests

- [x] Functions unit testでfinalizeの通常完了・停止・空内容・競合を検証する
- [x] Functions integration testで所有権と保存件数を検証する
- [x] Frontend `useChat` / `chatApi` testでabortと停止通知を検証する
- [x] 既存のChatMessage / ChatMessageList表示テストを必要最小限更新する

### Phase 4: Verification

- [x] `cd functions && npm run build && npm test`
- [x] `cd frontend && npm run build && npm test`
- [ ] 停止操作をdesktop/mobile viewportで手動確認する（未実施）
- [x] `git diff --check`
- [x] spec Status、backlog、実装メモを更新する

## Verification Commands

```bash
cd functions && npm run build && npm test
cd frontend && npm run build && npm test
git diff --check
```
