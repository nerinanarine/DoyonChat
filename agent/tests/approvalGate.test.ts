import approvalGate, {
  readApprovalLevel,
  readDangerousTools,
  shouldConfirm,
  summarizeInput,
} from '../src/extensions/approvalGate';

describe('approvalGate helpers', () => {
  it('reads approval level with dangerous-only default', () => {
    expect(readApprovalLevel({})).toBe('dangerous-only');
    expect(readApprovalLevel({ APPROVAL_LEVEL: 'auto' })).toBe('auto');
    expect(readApprovalLevel({ APPROVAL_LEVEL: 'always' })).toBe('always');
    expect(readApprovalLevel({ APPROVAL_LEVEL: 'bogus' })).toBe('dangerous-only');
  });

  it('reads dangerous tool list with defaults', () => {
    expect(readDangerousTools({})).toEqual(['write', 'edit', 'bash', 'powershell']);
    expect(readDangerousTools({ APPROVAL_DANGEROUS_TOOLS: 'read, grep' })).toEqual(['read', 'grep']);
    expect(readDangerousTools({ APPROVAL_DANGEROUS_TOOLS: '' })).toEqual([
      'write',
      'edit',
      'bash',
      'powershell',
    ]);
  });

  it('decides confirmation by level', () => {
    expect(shouldConfirm('write', 'auto', ['write'])).toBe(false);
    expect(shouldConfirm('read', 'always', ['write'])).toBe(true);
    expect(shouldConfirm('write', 'dangerous-only', ['write'])).toBe(true);
    expect(shouldConfirm('read', 'dangerous-only', ['write'])).toBe(false);
  });

  it('summarizes tool input safely', () => {
    expect(summarizeInput({ path: 'a.ts' })).toBe('{"path":"a.ts"}');
    expect(summarizeInput(undefined)).toBe('(引数なし)');
    const long = summarizeInput({ text: 'x'.repeat(1000) });
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('approvalGate extension', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV };
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  function mount(env: Record<string, string>) {
    process.env = { ...OLD_ENV, ...env };
    const handlers: Record<string, (event: unknown, ctx: unknown) => Promise<unknown>> = {};
    const confirms: Array<{ title: string; message?: string }> = [];
    let confirmResult = true;
    const ctx = {
      ui: {
        confirm: async (title: string, message?: string) => {
          confirms.push({ title, message });
          return confirmResult;
        },
      },
    };
    approvalGate({
      on: (event: string, handler: (event: unknown, ctx: unknown) => Promise<unknown>) => {
        handlers[event] = handler;
      },
    });
    const fire = (toolName: string, input: unknown = {}) =>
      handlers['tool_call']({ toolName, toolCallId: 'call-1', input }, ctx);
    return { confirms, fire, setConfirmResult: (value: boolean) => { confirmResult = value; } };
  }

  it('auto allows everything without confirm', async () => {
    const { confirms, fire } = mount({ APPROVAL_LEVEL: 'auto' });
    expect(await fire('write')).toBeUndefined();
    expect(confirms).toHaveLength(0);
  });

  it('dangerous-only allows safe tools without confirm', async () => {
    const { confirms, fire } = mount({ APPROVAL_LEVEL: 'dangerous-only' });
    expect(await fire('read', { path: 'a.ts' })).toBeUndefined();
    expect(confirms).toHaveLength(0);
  });

  it('dangerous-only confirms dangerous tools and blocks on reject', async () => {
    const { confirms, fire, setConfirmResult } = mount({ APPROVAL_LEVEL: 'dangerous-only' });
    expect(await fire('write', { path: 'a.ts' })).toBeUndefined();
    expect(confirms).toHaveLength(1);
    expect(confirms[0].title).toContain('write');

    setConfirmResult(false);
    const blocked = await fire('bash', { command: 'rm -rf /' });
    expect(blocked).toEqual(
      expect.objectContaining({ block: true, reason: expect.stringContaining('bash') }),
    );
  });

  it('always confirms even safe tools', async () => {
    const { confirms, fire } = mount({ APPROVAL_LEVEL: 'always' });
    expect(await fire('read')).toBeUndefined();
    expect(confirms).toHaveLength(1);
  });

  it('honors custom dangerous tool list', async () => {
    const { confirms, fire } = mount({
      APPROVAL_LEVEL: 'dangerous-only',
      APPROVAL_DANGEROUS_TOOLS: 'read',
    });
    expect(await fire('read')).toBeUndefined();
    expect(confirms).toHaveLength(1);
    expect(await fire('write')).toBeUndefined();
    expect(confirms).toHaveLength(1);
  });
});
