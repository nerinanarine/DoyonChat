describe('Functions user settings agent keys', () => {
  const originalAuthEnabled = process.env.AUTH_ENABLED;
  const originalCosmosRequired = process.env.COSMOSDB_REQUIRED;
  let service: typeof import('../../src/services/userSettingsService');

  beforeEach(() => {
    jest.resetModules();
    process.env.AUTH_ENABLED = 'true';
    process.env.COSMOSDB_REQUIRED = 'false';

    const unavailableContainer = {
      read: jest.fn().mockRejectedValue(new Error('CosmosDB unavailable')),
    };
    jest.doMock('../../src/db', () => ({
      getUserSettingsContainer: jest.fn(() => unavailableContainer),
    }));

    service = require('../../src/services/userSettingsService');
  });

  afterEach(() => {
    jest.resetModules();
  });

  afterAll(() => {
    if (originalAuthEnabled === undefined) delete process.env.AUTH_ENABLED;
    else process.env.AUTH_ENABLED = originalAuthEnabled;
    if (originalCosmosRequired === undefined) delete process.env.COSMOSDB_REQUIRED;
    else process.env.COSMOSDB_REQUIRED = originalCosmosRequired;
  });

  it('saves and returns agentApprovalLevel', async () => {
    const updated = await service.updateSettings('alice', {
      agentApprovalLevel: 'dangerous-only',
    });
    expect(updated.settings).toEqual({ agentApprovalLevel: 'dangerous-only' });
    await expect(service.getSettings('alice')).resolves.toEqual(updated);
  });

  it('accepts every valid agentApprovalLevel', async () => {
    for (const level of ['auto', 'dangerous-only', 'always'] as const) {
      await service.updateSettings('alice', { agentApprovalLevel: level });
      const stored = await service.getSettings('alice');
      expect(stored.settings).toEqual({ agentApprovalLevel: level });
    }
  });

  it('excludes an out-of-domain agentApprovalLevel from responses via sanitize', async () => {
    // ストアには保存されるが、レスポンスには現れない
    await service.updateSettings('alice', { agentApprovalLevel: 'bogus' });
    const stored = await service.getSettings('alice');
    expect(stored.settings).toEqual({});
  });

  it('removes agentApprovalLevel when patched with null', async () => {
    await service.updateSettings('alice', { agentApprovalLevel: 'always' });
    const cleared = await service.updateSettings('alice', { agentApprovalLevel: null });
    expect(cleared.settings).toEqual({});
    await expect(service.getSettings('alice')).resolves.toEqual(cleared);
  });

  it('saves and trims agentModel (normalized to a qualified id) and agentSubagentModel', async () => {
    const updated = await service.updateSettings('alice', {
      agentModel: '  kimi-k2.6  ',
      agentSubagentModel: 'openai/gpt-5.6',
    });
    expect(updated.settings).toEqual({
      agentModel: 'opencode-go/kimi-k2.6',
      agentSubagentModel: 'openai/gpt-5.6',
    });
    await expect(service.getSettings('alice')).resolves.toEqual(updated);
  });

  it('accepts an already-qualified agentModel and keeps the qualified form', async () => {
    const updated = await service.updateSettings('alice', {
      agentModel: 'opencode-go/grok-4.6',
    });
    expect(updated.settings).toEqual({ agentModel: 'opencode-go/grok-4.6' });
  });

  it('rejects an unknown agentModel with 400', async () => {
    await expect(
      service.updateSettings('alice', { agentModel: 'anthropic/claude-sonnet-4' }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.updateSettings('alice', { agentModel: 'totally-unknown' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('normalizes bare ids and rejects out-of-catalog refs via normalizeAgentModel', () => {
    expect(service.normalizeAgentModel('kimi-k2.6')).toBe('opencode-go/kimi-k2.6');
    expect(service.normalizeAgentModel('opencode-go/kimi-k2.6')).toBe(
      'opencode-go/kimi-k2.6',
    );
    expect(service.normalizeAgentModel('anthropic/claude-sonnet-4')).toBeNull();
    expect(service.normalizeAgentModel('unknown-model')).toBeNull();
    expect(service.normalizeAgentModel('')).toBeNull();
  });

  it('excludes blank agent model names from responses', async () => {
    const updated = await service.updateSettings('alice', {
      agentModel: '   ',
      agentSubagentModel: '',
    });
    expect(updated.settings).toEqual({});
  });

  it('keeps existing keys when merging agent keys', async () => {
    await service.updateSettings('alice', { displayName: 'Alice' });
    const updated = await service.updateSettings('alice', {
      agentApprovalLevel: 'auto',
      agentModel: 'kimi-k2.6',
    });
    expect(updated.settings).toEqual({
      displayName: 'Alice',
      agentApprovalLevel: 'auto',
      agentModel: 'opencode-go/kimi-k2.6',
    });
  });

  it('ignores unknown keys and keeps empty patches as no-ops', async () => {
    await service.updateSettings('alice', { agentApprovalLevel: 'auto' });
    const before = await service.getSettings('alice');

    const noop = await service.updateSettings('alice', {
      theme: 'dark',
      agentRunLimit: 99,
    });
    expect(noop).toEqual(before);

    const spoofed = await service.updateSettings('alice', {
      id: 'spoofed',
      userId: 'bob',
      agentApprovalLevel: 'always',
    });
    expect(spoofed.userId).toBe('alice');
    expect(spoofed.settings).toEqual({ agentApprovalLevel: 'always' });
  });
});

describe('Functions user settings agent keys (handler validation)', () => {
  const originalAuthEnabled = process.env.AUTH_ENABLED;
  const originalCosmosRequired = process.env.COSMOSDB_REQUIRED;

  beforeAll(() => {
    process.env.AUTH_ENABLED = 'false';
    process.env.COSMOSDB_REQUIRED = 'false';
    // この describe 単体で実行された場合でも DB をメモリフォールバックへ倒す
    jest.doMock('../../src/db', () => ({
      getUserSettingsContainer: jest.fn(() => ({
        read: jest.fn().mockRejectedValue(new Error('CosmosDB unavailable')),
      })),
    }));
    jest.resetModules();
  });

  afterAll(() => {
    if (originalAuthEnabled === undefined) delete process.env.AUTH_ENABLED;
    else process.env.AUTH_ENABLED = originalAuthEnabled;
    if (originalCosmosRequired === undefined) delete process.env.COSMOSDB_REQUIRED;
    else process.env.COSMOSDB_REQUIRED = originalCosmosRequired;
  });

  function patch(body: Record<string, unknown>) {
    return new (require('@azure/functions').HttpRequest)({
      method: 'PATCH',
      url: 'http://localhost/api/users/me/settings',
      body: { string: JSON.stringify(body) },
    });
  }

  it('rejects invalid agentApprovalLevel with 400', async () => {
    const { userSettingsHandler } = require('../../src/functions/users');
    for (const value of ['bogus', 123, true]) {
      const response = await userSettingsHandler(patch({ agentApprovalLevel: value }), {} as never);
      expect(response.status).toBe(400);
    }
  });

  it('accepts valid agent keys and persists them via the handler', async () => {
    const { userSettingsHandler } = require('../../src/functions/users');
    const saved = await userSettingsHandler(
      patch({
        agentApprovalLevel: 'dangerous-only',
        agentModel: 'kimi-k2.6',
        agentSubagentModel: 'openai/gpt-5.6',
      }),
      {} as never,
    );
    expect(saved.status).toBe(200);
    expect(saved.jsonBody).toEqual(
      expect.objectContaining({
        settings: {
          agentApprovalLevel: 'dangerous-only',
          agentModel: 'opencode-go/kimi-k2.6',
          agentSubagentModel: 'openai/gpt-5.6',
        },
      }),
    );
  });

  it('rejects an unknown agentModel with 400 via the handler', async () => {
    const { userSettingsHandler } = require('../../src/functions/users');
    for (const value of ['anthropic/claude-sonnet-4', 'totally-unknown']) {
      const response = await userSettingsHandler(patch({ agentModel: value }), {} as never);
      expect(response.status).toBe(400);
    }
  });

  it.each([['agentModel', 123], ['agentSubagentModel', ['x']]])(
    'rejects a non-string %s with 400',
    async (field, value) => {
      const { userSettingsHandler } = require('../../src/functions/users');
      const response = await userSettingsHandler(patch({ [field]: value }), {} as never);
      expect(response.status).toBe(400);
    },
  );
});