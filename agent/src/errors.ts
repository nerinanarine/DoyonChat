/**
 * 安全なエラーコードのみを利用者（Functions/UI）へ伝える契約（P2-003 流儀の継承）。
 * pi プロセスの内部本文・API キー等はメッセージに含めない。
 */
export type AgentSafeErrorCode = 'timeout' | 'server' | 'network' | 'interrupted';

export class AgentError extends Error {
  constructor(
    public readonly code: AgentSafeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AgentError';
  }
}