# DoyonChat Backlog

## 優先度の定義

| 優先度 | 名称 | 説明 |
|--------|------|------|
| **P0** | Critical | 障害・セキュリティ問題。即座に対応が必要 |
| **P1** | High | ユーザビリティに直結する重要機能。次の開発スプリントで実装 |
| **P2** | Medium | 利便性向上・エッジケース対応。計画的に実装 |
| **P3** | Low | 追加価値・運用改善。余裕がある時に実装 |
| **P4** | Nice to have | あれば嬉しい機能。アイデア段階 |

## ステータスの定義

| ステータス | 説明 |
|-----------|------|
| 🔴 未対応 | まだ着手していない |
| 🟡 進行中 | 実装中またはレビュー中 |
| 🟢 対応済み | 本番環境にデプロイ済み |
| ⚪ 保留 | 要件変更や技術的ブロックで一時停止 |

---

## バックログ一覧

| ID | タイトル | 優先度 | ステータス | カテゴリ | 関連仕様 | 備考 |
|----|---------|--------|-----------|---------|---------|------|
| [P1-001](items/P1-001-image-upload-ui.md) | 画像入力（マルチモーダル）フロントエンド UI | P1 | 🟢 対応済み | 機能追加 | FR-006 | 画像選択・D&D・プレビュー・Base64送信を本番デプロイ済み |
| [P1-002](items/P1-002-multimodal-warning.md) | マルチモーダル非対応モデル警告 | P1 | 🔴 未対応 | UX改善 | FR-014 | MessagesはBackendで400拒否済み、送信前の警告UIが未対応 |
| [P1-003](items/P1-003-partial-save-on-stop.md) | ストリーミング中断時の中間保存 | P1 | 🔴 未対応 | データ保全 | — | データ損失防止 |
| [P1-004](items/P1-004-auto-title.md) | 会話タイトルの自動生成 | P1 | 🟢 対応済み | UX改善 | [仕様](../P1-004/spec.md) | AI 要約タイトル（deepseek-v4-flash）、本番デプロイ済み |
| [P1-005](items/P1-005-entra-id-auth.md) | Entra ID（Azure AD）を利用したユーザー認証 | P1 | 🟢 対応済み | セキュリティ | — | P1-006 の前提条件を完了 |
| [P1-006](items/P1-006-user-separated-chats.md) | ユーザーごとにチャットを分ける | P1 | 🟢 対応済み | セキュリティ | [統合仕様](../006-user-isolation-functions/spec.md) | P2-006 と同時実装、本番切替完了 |
| [P1-007](items/P1-007-reasoning-display.md) | Reasoning モデルの Thinking コンテンツをわかりやすく表示 | P1 | 🟢 対応済み | UX改善 | — | 思考と回答を視覚的に分離、開発環境反映済み |
| [P1-008](items/P1-008-doyonhub-home.md) | DoyonHubトップページ・ツールランチャー | P1 | 🔴 未対応 | 機能追加 | — | DoyonChatなどの各種ツールへの入口 |
| [P1-009](items/P1-009-admin-menu.md) | Adminメニュー | P1 | 🔴 未対応 | 管理機能 | P1-008 | DoyonHubのトップメニューに管理機能への入口を追加 |
| [P1-010](items/P1-010-user-management.md) | ユーザー管理 | P1 | 🔴 未対応 | 管理機能 | P1-009 | 管理対象・操作範囲は後で決定 |
| [P2-001](items/P2-001-context-length-warning.md) | 長い会話履歴の警告 | P2 | 🔴 未対応 | UX改善 | — | 推定トークン数で判定 |
| [P2-002](items/P2-002-multi-tab-sync.md) | 複数タブ間の状態同期 | P2 | 🔴 未対応 | 利便性 | — | BroadcastChannel 使用 |
| [P2-003](items/P2-003-error-ux.md) | API エラー時のユーザーフレンドリーな表示 | P2 | 🔴 未対応 | UX改善 | — | 種別ごとにメッセージ変更 |
| [P2-004](items/P2-004-image-validation.md) | 画像サイズ制限のフロントエンドバリデーション | P2 | 🟢 対応済み | 機能追加 | — | 5MB上限・画像形式検証を本番デプロイ済み |
| [P2-005](items/P2-005-rename-conversation.md) | 会話の手動リネーム | P2 | 🟢 対応済み | UX改善 | [仕様](../008-rename-conversation/spec.md) | 実装・検証・本番デプロイ完了 |
| [P2-006](items/P2-006-functions-migration.md) | バックエンドを App Service から Azure Functions に変更 | P2 | 🟢 対応済み | コスト・スケーリング | [統合仕様](../006-user-isolation-functions/spec.md) | Functions本番切替・旧App Service/Plan削除完了 |
| [P2-007](items/P2-007-cicd-cleanup.md) | CI/CD ワークフロー重複・クリーンアップ | P2 | 🔴 未対応 | 運用改善 | — | 未使用 Secret/Var 整理、Bicep 重複排除、ビルド二重実行回避 |
| [P2-008](items/P2-008-user-settings.md) | ユーザーごとに設定を保存できる機能 | P2 | 🟢 対応済み | 利便性 | [仕様](../P2-008/spec.md) | 既定モデル設定・設定メニューへログアウト移動、本番デプロイ済み |
| [P2-009](items/P2-009-playwright-ci-e2e.md) | Playwright による CI/CD ブラウザテスト導入 | P2 | 🔴 未対応 | 品質・運用 | P1-005 | PR smoke、デプロイ後検証、実 Entra E2E の段階導入 |
| [P2-010](items/P2-010-model-and-generation-time.md) | 生成メッセージへのモデル名・生成時間表示 | P2 | 🔴 未対応 | UX改善 | — | メッセージ単位の利用モデルと初回回答表示時間を表示 |
| [P2-011](items/P2-011-opencode-go-models.md) | OpenCode Goモデルカタログ更新・全モデル実API疎通 | P2 | 🟡 進行中 | 機能追加・品質 | [仕様](../009-opencode-go-models/spec.md) | 26モデル・3プロトコル対応へ更新（2026-08-31、grok-4.5/ox-alpha-free廃止）。26/26 live test成功、本番デプロイ待ち |
| [P3-001](items/P3-001-dark-mode.md) | ダークモード | P3 | 🔴 未対応 | UI/UX | — | Tailwind dark: 修飾子 |
| [P3-002](items/P3-002-search.md) | 会話の検索 | P3 | 🔴 未対応 | 利便性 | — | クライアントサイド検索 |
| [P3-003](items/P3-003-export.md) | 会話のエクスポート | P3 | 🔴 未対応 | 利便性 | — | Markdown / JSON |
| [P3-004](items/P3-004-shortcuts.md) | キーボードショートカット | P3 | 🔴 未対応 | 利便性 | — | パワーユーザー向け |
| [P3-005](items/P3-005-a11y.md) | アクセシビリティ対応 | P3 | 🔴 未対応 | 品質 | — | WCAG AA 準拠 |
| [P3-006](items/P3-006-virtual-scroll.md) | 長い会話の仮想スクロール | P3 | 🔴 未対応 | パフォーマンス | — | 100件以上のメッセージ |
| [P3-007](items/P3-007-tests.md) | ユニットテスト強化 | P3 | 🔴 未対応 | 品質 | — | カバレッジ 80% 目標、LLM各モデルの実API疎通テストは別途実施 |
| [P3-008](items/P3-008-cicd-docs-fix.md) | CI/CD 関連ドキュメントの誤記修正 | P3 | 🔴 未対応 | ドキュメント | — | spec.md FR-003、setup-guide 手順3.1 |
| [P3-009](items/P3-009-cicd-security-hardening.md) | CI/CD セキュリティハードニング | P3 | 🔴 未対応 | セキュリティ | — | SHA ピン化、permissions 宣言の一貫化 |
| [P3-010](items/P3-010-ai-agent.md) | AIのエージェント化 | P3 | 🔴 未対応 | 機能追加 | — | Function Calling・ツール連携検討 |
| [P3-011](items/P3-011-pwa-android-ios.md) | PWA対応（AndroidとiPhone両方） | P3 | 🟢 対応済み | 利便性 | [仕様](../P3-011/spec.md) | vite-plugin-pwa、実機確認、デプロイ完了 |
| [P4-002](items/P4-002-templates.md) | プロンプトテンプレート | P4 | 🔴 未対応 | 機能追加 | — | localStorage 保存 |
| [P4-003](items/P4-003-code-exec.md) | コードブロックの実行機能 | P4 | 🔴 未対応 | 機能追加 | — | Sandpack 検討 |
| [P4-004](items/P4-004-voice.md) | 音声入力（Web Speech API） | P4 | 🔴 未対応 | 機能追加 | — | ブラウザ対応状況依存 |
| [P4-005](items/P4-005-share.md) | 会話の共有（リンク生成） | P4 | 🔴 未対応 | 機能追加 | — | 読み取り専用公開リンク |

---

## 実装済み機能（参考）

以下は Phase 1（MVP）で実装済みの機能です。

| ID | タイトル | 関連仕様 | 実装ファイル |
|----|---------|---------|------------|
| MVP-001 | テキストチャットとストリーミング応答 | FR-001 | `useChat.ts`, `chat.ts` |
| MVP-002 | 複数会話の管理と履歴保持 | FR-002, FR-003 | `useConversations.ts`, `conversationService.ts` |
| MVP-003 | Markdown / コードブロックレンダリング | FR-005 | `MarkdownRenderer.tsx`, `CodeBlock.tsx` |
| MVP-004 | レスポンシブデザイン | FR-009 | `AppLayout.tsx`, Tailwind |
| MVP-005 | モデル切り替え | FR-011, FR-012 | `App.tsx`, `models.ts` |
| MVP-006 | CosmosDB 永続化 + in-memory フォールバック | FR-002 | `conversationService.ts` |
| MVP-007 | Azure デプロイ（App Service + SWA + CosmosDB） | — | `infra/`, `quickstart.ja.md` |
| MVP-008 | ストリーミング停止ボタン | FR-010 | `useChat.ts` |
| MVP-009 | API キー隠蔽 | FR-008 | `chat.ts` |
