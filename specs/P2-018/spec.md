# Feature Specification: Agent gateway ContainerAppのスケールゼロ化＋起動中ローディング

**Feature Branch**: `feat/p1-012-p2-018-p2-019-p3-016` | **Spec Folder**: `specs/P2-018` | **Created**: 2026-10-03

**Status**: Draft

**Input**: [P2-018 backlog item](../000_backlog/items/P2-018-containerapp-scale-zero.md)

> **背景:** agent gateway の ContainerApp が `minReplicas: 1` で常時課金されている。利用は間欠的なためゼロ化で削減し、コールドスタートの待ち時間は起動中表示で吸収する。現状 gateway 稼働検出は存在せず、送信時に初めて 503/SSE エラーとして表面化する。

## User Scenarios & Testing

### User Story 1 - アイドル時は課金が発生しない (Priority: P1)

利用がない時間帯は gateway インスタンスがゼロまで縮退し、常時起動の課金がなくなる。

**Independent Test**: アイドル状態でレプリカ数が 0 になることを Azure 側で確認できる。

**Acceptance Scenarios**:

1. **Given** 一定時間リクエストがない状態、**When** ContainerApp のレプリカ数を確認する、**Then** 0 になっている

### User Story 2 - 起動中は待機状態がわかる (Priority: P1)

ゼロ状態から初回利用する際、コンテナ起動中であることがローディング表示でわかり、故障と誤認しない。起動完了後は通常どおり利用できる。

**Independent Test**: ゼロ状態からの初回送信で起動中表示が出て、完了後に応答が返ることを確認できる。

**Acceptance Scenarios**:

1. **Given** gateway が停止中（レプリカ 0）、**When** メッセージを送信する、**Then** 起動中である旨の表示が出る
2. **Given** 起動中表示が出ている状態、**When** 起動が完了する、**Then** 表示が消えてエージェントの応答が始まる
3. **Given** 起動中、**When** 一定時間を超過する、**Then** タイムアウト表示と再試行導線が出る（P2-003 のエラーUIと同型）

## Edge Cases

- **0→1 遷移中のインバウンド挙動**: 保持/キューか早期 503 かは未確認。dev実測で確定し、ポーリング方式に反映する
- **`/health` 200 ≠ pi 準備完了**: gateway プロセスは起動直後に 200 を返すが、pi はプロンプト毎に遅延初期化される。真の ready 判定には `/models` 経由（`client.start()` を伴う）が有効。`agentGateway.ts` に中継関数がないため追加する
- **Functions の `GET /health` は検出に使えない**: gateway を経由しないためスケールさせられない。検出は必ず gateway 経由で行う
- **プローブなし**: readiness/liveness プローブは未設定。必要性は dev実測後に判断する（本specでは追加しない方針）
- **初回送信＝ウォームアップ**: 専用セッション開始APIは存在しない。起動シーケンスは「送信→503→起動中表示＋`/models` ポーリング→`retrySend` で自動再送」とする。ポーリング先行はしない
- **SSE中断時の再試行**: コールドスタートでストリームが `done` なしに切れた場合も `retrySend`（`userMessageId` 冪等）で再送する。新規の gap 検出・再組立ては作らない
- **P1-012 との関係**: 判定なし。Agent経路のみのため、通常チャット分岐の考慮は不要

## Requirements

### Functional Requirements

- **FR-001**: `infra/modules/agentPool.bicep` の `scale.minReplicas` を `1` から `0` に変更しなければならない（`maxReplicas` 等の現行設定は維持）
- **FR-002**: gateway 稼働検出のため、Functions に gateway `/models` への中継（`forwardGetModels`）を追加しなければならない（`forwardGetRun` と同型。`/health` は pi 準備完了を証明できないため準備完了判定には使わない）
- **FR-003**: Frontend に gateway 起動中のローディング表示を追加しなければならない（`LoadingState`・P2-013 の状態遷移モデルを再利用する）
- **FR-004**: 起動タイムアウト時は P2-003 のエラーUIへ遷移し、再試行導線を提供しなければならない。起動ポーリング中の 5xx・タイムアウトは「継続ポーリング」とし、合計タイムアウト超過または明示的な設定エラーのみエラーUIへ遷移しなければならない
- **FR-006**: 承認（`/approve`）・run 照会（`/runs/:id`）経路もコールドスタート時は起動中表示＋再試行可能にし、素の 503 のままにしてはならない
- **FR-005**: コールドスタート時間と 0→1 遷移中の挙動を dev で実測し、ポーリング間隔・タイムアウト値の根拠としなければならない

### Non-Functional Requirements

- **NFR-001**: Functions / SWA の infra・スケール構成を変更してはならない（対象外）。Functions への中継コード追加（FR-002）は許容する
- **NFR-002**: 通常の `npm test`・CI で実 Azure リソースを触ってはならない（実測は dev 環境の手動手順とする）
- **NFR-003**: コールドスタート時以外の応答速度・承認フローに退行があってはならない

## Success Criteria

- **SC-001**: アイドル時にレプリカが 0 になる
- **SC-002**: 起動中表示→完了→応答の一連が手動確認できる
- **SC-003**: タイムアウト・再試行がテストで固定される
- **SC-004**: `npm test`・ビルドが green で差分外の変更がない

## Out of Scope

- readiness/liveness プローブの追加（実測後に別途判断）
- Functions / SWA のスケール設定変更
- P3-016（Files マウント。ゼロ化後も永続化される前提で連携）

## Assumptions

- ACA の 0→1 スケールは dev実測で許容範囲の時間に収まる
- ポーリング検出で ACA が起動すること（HTTP 経由のスケール動作）
