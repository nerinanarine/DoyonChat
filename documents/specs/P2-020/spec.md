# Feature Specification: ユーザー別AGENTS.md編集UI

**Feature Branch**: `feat/p1-012-p2-018-p2-019-p3-016` | **Spec Folder**: `specs/P2-020` | **Created**: 2026-10-04

**Status**: Draft

**保存先決定（2026-10-04 オーナー）**: Azure Files共有（B）。設定ファイルは共有上に置き、UIはそれをロードして表示・保存する。CosmosDB案（C）は不採用。

**Input**: [P2-020 backlog item](../000_backlog/items/P2-020-user-agents-md.md)

> **背景:** エージェント指示（AGENTS.md）をユーザーごとにUIから編集したい。設定ファイルは Azure Files共有上に置き、UIはそれをロードしてユーザーに見せる。gatewayは既に per-user agent dir（`<dataDir>/users/{userId}/config`）で pi を起動しており、同配置の `AGENTS.md` は global context として読まれる。共有はコンテナにマウント済みのため、gatewayはマウント経由で直接読める。

## User Scenarios & Testing

### User Story 1 - 自分のAGENTS.mdを参照・編集・保存する (Priority: P1)

ユーザーがUI画面で自分の AGENTS.md を参照し、編集して保存する。保存はUIからのみ行える。

**Independent Test**: 編集→保存→再取得で内容一致を確認できる。

**Acceptance Scenarios**:

1. **Given** UI画面を開いた状態、**When** AGENTS.md を見る、**Then** 自分の現在の内容が表示される
2. **Given** 内容を編集した状態、**When** 保存する、**Then** 保存成功となり、再取得で一致する
3. **Given** 未設定の状態、**When** 見る、**Then** 空（または既定文）とわかる表示になる

### User Story 2 - 保存内容がエージェントに反映される (Priority: P1)

保存した AGENTS.md が次回プロンプトからエージェントの動作に反映される。

**Independent Test**: 保存→送信し、指示が効いていることを確認できる。

**Acceptance Scenarios**:

1. **Given** AGENTS.md を保存した状態、**When** 次にメッセージを送信する、**Then** 指示が反映された応答になる
2. **Given** 空の状態、**When** 送信する、**Then** 従来どおり動作する（退行なし）

### User Story 3 - 他ユーザーのAGENTS.mdは見えない (Priority: P1)

他ユーザーの内容は参照・編集・保存のいずれもできない。

**Independent Test**: ユーザーBの文書にユーザーAでアクセスし拒否されることを確認できる。

**Acceptance Scenarios**:

1. **Given** ユーザーAでログインした状態、**When** ユーザーBの文書にアクセスする、**Then** 拒否される（存在漏洩なしの404）
2. **Given** 任意のユーザー、**When** パストラバーサルを試みる、**Then** 拒否される

## Edge Cases

- **保存先（B・確定）**: 正本は Azure Files共有の `artifacts/{userId}/config/AGENTS.md`。UIの取得・保存APIは共有に対する読み書き（読みはP3-016の `readShareArtifact` と同型、書きは新規upsert）とする
- **UI限定**: 新規の取得・保存APIは認証＋所有者スコープのみ。素のファイル書込みエンドポイントは作らない
- **空・巨大入力**: 空（クリア）は共有上・userConfigDirの両方を削除する（stale残存防止）。巨大は上限拒否。上限値は Phase 1 で数値確定する（Functions要求上限との整合。既定案の目安は100KB）
- **未設定時のGET**: 未設定ユーザーの取得は404（＝未設定）とする。UIは既定文表示とし、そのまま保存すると新規作成になる
- **同時編集**: last-write-wins。競合検出（ETag等）はしない
- **版管理**: 対象外（単一ドキュメント上書き）
- **委任プロンプトとの関係**: 既存 `--append-system-prompt` は固定のまま残す
- **P3-016との関係**: 所有者検証・ユーザー分離の規約を共有する。保存先は共有しない

## Requirements

### Functional Requirements

- **FR-001**: UIから自分の AGENTS.md を取得できなければならない（認証＋所有者スコープ）
- **FR-002**: UIから編集・保存できなければならない。UI以外の書込み経路として、エージェント自身による自己文書への書込みは許容する（同一ユーザー所有の例外。P3-015/P3-016のファイル操作範囲）。それ以外の書込み口（素のファイル書込みAPI等）は作ってはならない
- **FR-003**: 正本を Azure Files共有の `artifacts/{userId}/config/AGENTS.md` に永続化しなければならない。`config/` サブディレクトリ対応のパス検証・Directory作成を新規実装する（現行 `readShareArtifact` は `{userId}/{fileName}` 単一セグメント専用のため、そのまま流用できない）
- **FR-004**: プロンプト毎に共有から `userConfigDir/AGENTS.md` へ atomic write で再配置しなければならない（gatewayは自マウント経由で読む）。空（クリア）時は配置省略ではなく両方（共有上・userConfigDir）を削除しなければならない
- **FR-005**: 他者の文書へのアクセスは存在漏洩なしに拒否しなければならない（P3-016の404規約と同型）
- **FR-006**: パストラバーサルが不可能でなければならない
- **FR-007**: 保存内容が次回プロンプトから反映されなければならない

### Non-Functional Requirements

- **NFR-001**: `npm test`・`tsc` が green、実 Azure を使わないテストでなければならない
- **NFR-002**: 既存の承認フロー・通常送受信に退行があってはならない

## Success Criteria

- **SC-001**: プロンプト実行時に `userConfigDir/AGENTS.md` が保存内容と一致して配置されることがテストで固定される。指示の効き目は dev で手動確認する
- **SC-002**: 他者アクセス拒否・traversal拒否がテストで固定される
- **SC-003**: dev で保存→送信→反映を手動確認できる

## Out of Scope

- 版管理・差分表示
- 会話単位の指示

## Assumptions

- 保存先の既定案（C＋A）はオーナー承認済みである（下記判断点を参照）
- pi は `userConfigDir` の `AGENTS.md` を global context として読む（Phase 0/1 で dev 実機確認する）
- 共有への書込みは Functions の新規upsert経路のみとし、gatewayは読み＋userConfigDir配置のみ行う

## 要オーナー確認の判断点

- **J1**: 保存先 → **B（Azure Files共有）で確定**（2026-10-04）。CosmosDB案（C）は不採用
