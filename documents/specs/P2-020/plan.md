# Implementation Plan: ユーザー別AGENTS.md編集UI

**Spec**: [specs/P2-020/spec.md](./spec.md) | **Branch**: `feat/p1-012-p2-018-p2-019-p3-016` | **Created**: 2026-10-04

## Design Decisions

- **D1 — 保存先はB（J1確定済み）**: 正本は Azure Files共有 `artifacts/{userId}/config/AGENTS.md`。UI取得・保存APIは共有への読み書き。プロンプト毎にgatewayが自マウントから `userConfigDir/AGENTS.md` へ再配置する
- **D2 — API規約の踏襲**: `users/me/settings` の GET/PATCH と同型の所有者スコープ API。素のファイル書込み口は作らない
- **D3 — 配信規約の踏襲**: `chat.ts`→gateway payload→`handlePrompt` で再配置（`writeUserAgentSettings` と同型）
- **D4 — 所有者検証の踏襲**: P3-016の404規約（存在漏洩なし）＋traversal対策
- **D5 — dev先行**: UI・API とも dev で検証後に prod へ適用する

## Review Policy

- 各 Phase の成果物は完了条件として subagent `reviewer` によるレビューを必須とする（`reviewer` は読み取り専任。修正は `worker` が実施し、最終判断は parent が行う）
- レビュー観点：spec の受け入れ条件・FR との一致、他者文書への到達可能性、UI外経路の有無、今回差分外の変更混入

## Phases

### Phase 0 — 準備
- [ ] pi の AGENTS.md 読み取り経路（global context）を dev で実機確認する（FR-004/FR-007の前提のため Phase 1 より前に）
- [ ] backlog P2-020 を 🟡 進行中に更新する

### Phase 1 — Backend（共有読み書き＋再配置）
- [ ] 共有への読み＋upsert書込み（KV secret経由。PUT用SharedKey署名・`config/` Directory作成・サブディレクトリ対応のパス検証を新規実装）＋GET/PATCH API（所有者スコープ）を追加する
- [ ] プロンプト毎の `userConfigDir/AGENTS.md` 再配置（atomic write）を追加する
- [ ] 上限値を数値確定する（Functions要求上限・Cosmos RU・payloadサイズとの整合）
- [ ] 所有者外アクセス拒否・traversal拒否のテストを追加する（mock、実 Azure 不使用）
- [ ] `reviewer` レビューを通過してから Phase 2 へ進む

### Phase 2 — Frontend（編集UI）
- [ ] 参照・編集・保存のUI画面を追加する（設定メニュー配下）
- [ ] 保存→送信→反映を dev で手動確認する
- [ ] `reviewer` レビューを通過してから Phase 3 へ進む

### Phase 3 — 仕上げ
- [ ] 全体横断の `reviewer` レビューを実施し、指摘を解消する
- [ ] backlog P2-020 の変更履歴を更新する
- [ ] コミット・プッシュ（要ユーザー承認）
