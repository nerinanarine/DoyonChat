import { RawPiEvent } from './piClient';

export type RunStatus = 'running' | 'settled' | 'timeout' | 'interrupted' | 'error';

export interface ApprovalRecord {
  id: string;
  method: string;
  title?: string;
  message?: string;
  status: 'pending' | 'resolved' | 'expired' | 'cancelled';
}

export interface RunRecord {
  id: string;
  status: RunStatus;
  events: RawPiEvent[];
  /** events が上限で打ち切られた場合に立つ。 */
  truncated?: boolean;
  approvals: ApprovalRecord[];
  /** 会話対応の実行中ガードに使う。実行単位に紐づく conversationId。 */
  conversationId?: string;
  finalText?: string;
  code?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * 実行レコードの保持庫。SSE 切断後の再購読・最終回答回収（GET /runs/:id）用。
 * replica=1 前提のインメモリ実装で、TTL 過ぎ・件数超過分は破棄する。
 */
export class RunRegistry {
  private readonly runs = new Map<string, RunRecord>();
  private readonly timer: NodeJS.Timeout;

  constructor(
    private readonly maxRecords = 200,
    private readonly ttlMs = 600_000,
  ) {
    this.timer = setInterval(() => this.evict(), 60_000);
    // テスト・終了時のハンドル残留を防ぐ
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  create(id: string, conversationId?: string): RunRecord {
    const now = Date.now();
    const record: RunRecord = {
      id,
      status: 'running',
      events: [],
      approvals: [],
      conversationId,
      createdAt: now,
      updatedAt: now,
    };
    this.runs.set(id, record);
    while (this.runs.size > this.maxRecords) {
      const oldest = this.runs.keys().next();
      if (oldest.done) break;
      this.runs.delete(oldest.value);
    }
    return record;
  }

  get(id: string): RunRecord | undefined {
    return this.runs.get(id);
  }

  /**
   * 同じ会話に対して実行中（running）の run が存在するかを返す。
   * replica=1 前提のインメモリ判定で、同一会話の多重実行を防ぐ（429 用）。
   */
  hasActiveRunForConversation(conversationId: string): boolean {
    for (const record of this.runs.values()) {
      if (record.status === 'running' && record.conversationId === conversationId) {
        return true;
      }
    }
    return false;
  }

  appendEvent(id: string, event: RawPiEvent): void {
    const record = this.runs.get(id);
    if (!record || record.status !== 'running') return;
    // 長時間 run の delta 多発によるメモリ圧迫を防ぐ（先頭＝初期文脈を優先保持）。
    if (record.events.length >= 2000) {
      record.truncated = true;
      return;
    }
    record.events.push(event);
    record.updatedAt = Date.now();
  }

  complete(id: string, finalText: string, interrupted = false): void {
    const record = this.runs.get(id);
    if (!record) return;
    record.status = interrupted ? 'interrupted' : 'settled';
    record.finalText = finalText;
    record.updatedAt = Date.now();
  }

  fail(id: string, code: string): void {
    const record = this.runs.get(id);
    if (!record) return;
    record.status = code === 'timeout' ? 'timeout' : code === 'interrupted' ? 'interrupted' : 'error';
    record.code = code;
    record.updatedAt = Date.now();
  }

  approvalPending(id: string, approval: Omit<ApprovalRecord, 'status'>): void {
    const record = this.runs.get(id);
    if (!record) return;
    record.approvals.push({ ...approval, status: 'pending' });
    record.updatedAt = Date.now();
  }

  approvalSettled(id: string, approvalId: string, status: 'resolved' | 'expired' | 'cancelled'): void {
    const record = this.runs.get(id);
    if (!record) return;
    const approval = record.approvals.find((a) => a.id === approvalId);
    if (approval) approval.status = status;
    record.updatedAt = Date.now();
  }

  dispose(): void {
    clearInterval(this.timer);
  }

  private evict(): void {
    const threshold = Date.now() - this.ttlMs;
    for (const [id, record] of this.runs) {
      if (record.updatedAt < threshold) this.runs.delete(id);
    }
  }
}
