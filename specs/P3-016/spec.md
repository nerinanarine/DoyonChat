# Feature Specification: ユーザー専用Azure Filesマウント・アーティファクト保存

**Feature Branch**: `feat/p1-012-p2-018-p2-019-p3-016` | **Spec Folder**: `specs/P3-016` | **Created**: 2026-10-03

**Status**: Draft

**Input**: [P3-016 backlog item](../000_backlog/items/P3-016-user-azure-files.md)

> **背景:** エージェントのファイル機能（P3-015）の保存先がコンテナ内の使い捨て領域では再起動で消える。ユーザー単位の永続領域が必要。現状ボリュームマウントは皆無、ダウンロード導線も未実装のグリーンフィールド。既定パターンとして UAMI＋Key Vault 参照（キー直書きなし）がある。

## User Scenarios & Testing

### User Story 1 - 作成物が再起動後も残る (Priority: P1)

エージェントが作成したファイルがユーザー専用の永続領域に保存され、コンテナ再起動・スケールゼロ復帰後も残る。

**Independent Test**: ファイル作成→gateway 再起動→同一パスが参照できることを dev で確認できる。

**Acceptance Scenarios**:

1. **Given** エージェントがファイルを作成した状態、**When** gateway コンテナを再起動する、**Then** 作成物が残存する
2. **Given** P2-018 のスケールゼロ状態、**When** 復帰後に参照する、**Then** 作成物が残存する

### User Story 2 - 他ユーザーの成果物が見えない (Priority: P1)

ユーザーごとに専用領域が分離され、他ユーザーの領域は参照・一覧できない。

**Independent Test**: ユーザーAの所有者検証でユーザーBの領域へのアクセスが拒否されることを確認できる。

**Acceptance Scenarios**:

1. **Given** ユーザーAの作成物、**When** ユーザーBがダウンロードを試みる、**Then** 拒否される
2. **Given** 任意のユーザー、**When** 他ユーザーの領域を一覧しようとする、**Then** 不可視である

### User Story 3 - 作成物をチャット画面から取得できる (Priority: P2)

保存物がチャット画面からダウンロードできる（P3-015 の受け入れ条件と接続）。

**Independent Test**: 作成→チャット画面のダウンロード導線→取得の一連を確認できる。

**Acceptance Scenarios**:

1. **Given** エージェントがファイルを作成した状態、**When** チャット画面の導線を使う、**Then** ファイルをダウンロードできる

## Edge Cases

- **P3-015 未完了**: ファイル操作ツール自体は P3-015 の範囲。本件は永続化の器（マウント＋配置＋配信）を提供し、P3-015 の進捗に依存せず dev実証できるダミー配置で検証する
- **マウント方式**: Azure Files の共有単位（ユーザー別共有 vs 単一共有＋ユーザー別ディレクトリ）は実装時に確定する。既定案は単一共有＋`{userId}` ディレクトリ分離（既存 `sessions/{userId}/` 規約と同型）
- **プロビジョニング**: 共有自体の作成は IaC、共有内の `{userId}` ディレクトリは初回利用時自動作成（`mkdirSync` 規約と同型）とする
- **容量・保持期間**: 本件では定めない（backlog 方針どおり後決定）。IaC にクォータの仮値は置かない
- **gateway→client の生成通知**: エージェントが生成物を通知する方式（SSE イベント種別追加等）は実装時に確定する
- **gateway は非認証**: 内部プロキシ前提のため、所有者検証は Functions 側（`verifyRunOwnership` 規約）で行い、gateway 側では `assertSafeId` 済み ID によるパス分離のみ行う。ただし現行 ingress は external のため、dev リリース前に `GATEWAY_AUTH_*` の設定または ingress 制限のいずれかを必須とする（任意 `userId` 主張による他者領域書込みを防ぐ）
- **P2-018 との関係**: スケールゼロ復帰後は Files が再マウントされる前提。起動中表示の対象に含めない。ただしマウント追加は起動時間に影響するため、実装後にコールドスタートを再計測し P2-018 の実測値を更新する

## Requirements

### Functional Requirements

- **FR-001**: agent gateway の ContainerApp に Azure Files をマウントし、`<dataDir>/artifacts/{userId}/` 配下を永続化しなければならない（既存 `sessions/{userId}/` 規約と同型）。マウントポイントは artifacts 専用とし（例: `/app/data/artifacts`）、`sessions/`・`users/` 等の ephemeral な `<dataDir>` 配下はローカルに残す（SMB上の大量小ファイルI/O回避）
- **FR-002**: マウント認証情報を Key Vault 参照＋UAMI で配線し、キー直書きをしてはならない（既存 `secrets[]`・`keyVaultAccessPolicy` 規約）
  - **制約（Phase 0 確定・2026-10-03）**: ACA の Azure Files マウント資格情報（`AzureFileProperties.accountKey`）には UAMI/Key Vault 参照を使用できない（`identity` 非対応＝BCP037、`getSecret` は secure module param 限定＝BCP180）。このため共有マウントの `accountKey` はデプロイ時 `listKeys()` 取得とし、Key Vault secret（Storageキー）＋UAMI `secrets:get` は Phase 2 の Functions 直接読み取り経路で参照する。
- **FR-003**: Functions にダウンロード配信エンドポイントを追加し、`authenticateRequest`＋`verifyRunOwnership` 規約で所有者検証しなければならない。配信経路は「Functions が Storage アカウントから共有を直接読む」（KV参照キーまたはUAMI。既定案） とし、Phase 0 で確定しなければならない
- **FR-004**: Frontend にダウンロード導線を追加しなければならない
- **FR-005**: 他ユーザーの領域への参照・一覧ができないことをテストで固定しなければならない
- **FR-006**: コンテナ再起動後も作成物が残存しなければならない

### Non-Functional Requirements

- **NFR-001**: dev先行で検証後に prod へ適用しなければならない
- **NFR-002**: 通常の `npm test`・CI で実 Azure リソースを触ってはならない
- **NFR-003**: コスト試算（Files容量・トランザクション）を dev実証後に記録しなければならない

## Success Criteria

- **SC-001**: 再起動後も作成物が残存することが dev で確認できる
- **SC-002**: 所有者外アクセス拒否がテストで固定される
- **SC-003**: チャット画面からのダウンロード一連が dev で確認できる
- **SC-004**: キー直書きなし・`npm test`・ビルド green

## Out of Scope

- ファイル操作ツール自体（P3-015 の範囲）
- 容量・クォータ・保持期間・削除ライフサイクルの確定（後決定）
- prod への適用（dev実証後に別途判断）

## Assumptions

- 単一共有＋`{userId}` ディレクトリ分離で認可要件を満たせる（実装時に確定）
- 初回利用時自動作成で運用可能である（実装時に確定）
