describe('Functions user settings service', () => {
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

  it('returns empty settings for a user without a saved document', async () => {
    await expect(service.getSettings('alice')).resolves.toEqual({
      userId: 'alice',
      settings: {},
    });
  });

  it('merges agentModel and returns it on subsequent reads', async () => {
    const updated = await service.updateSettings('alice', { agentModel: 'kimi-k2.6' });

    expect(updated.userId).toBe('alice');
    expect(updated.settings).toEqual({ agentModel: 'opencode-go/kimi-k2.6' });
    await expect(service.getSettings('alice')).resolves.toEqual(updated);
  });

  it('removes agentModel when patched with null', async () => {
    await service.updateSettings('alice', { agentModel: 'kimi-k2.6' });

    const cleared = await service.updateSettings('alice', { agentModel: null });

    expect(cleared.settings).toEqual({});
    await expect(service.getSettings('alice')).resolves.toEqual(cleared);
  });

  it('ignores reserved and unknown keys, applying only known keys', async () => {
    const updated = await service.updateSettings('alice', {
      id: 'spoofed',
      userId: 'bob',
      settings: { agentModel: 'grok-4.6' },
      theme: 'dark',
      agentModel: 'kimi-k2.6',
    });

    expect(updated.userId).toBe('alice');
    expect(updated.settings).toEqual({ agentModel: 'opencode-go/kimi-k2.6' });
  });

  it('saves and trims displayName', async () => {
    const updated = await service.updateSettings('alice', { displayName: '  Bob  ' });
    expect(updated.settings).toEqual({ displayName: 'Bob' });
    await expect(service.getSettings('alice')).resolves.toEqual(updated);
  });

  it('removes displayName when patched with null or empty', async () => {
    await service.updateSettings('alice', { displayName: 'Alice' });
    const clearedNull = await service.updateSettings('alice', { displayName: null });
    expect(clearedNull.settings).toEqual({});
    await service.updateSettings('alice', { displayName: 'Alice' });
    const clearedEmpty = await service.updateSettings('alice', { displayName: '' });
    expect(clearedEmpty.settings).toEqual({});
  });

  it('sanitizes displayName (trims and excludes blank)', async () => {
    await service.updateSettings('alice', { displayName: '  Alice  ' });
    const stored = await service.getSettings('alice');
    expect(stored.settings).toEqual({ displayName: 'Alice' });

    // Blank displayName should not appear in response
    await service.updateSettings('bob', { displayName: '   ' });
    const blank = await service.getSettings('bob');
    expect(blank.settings).toEqual({});
  });

  it('keeps displayName alongside agentModel', async () => {
    await service.updateSettings('alice', { agentModel: 'kimi-k2.6', displayName: 'Alice' });
    // updateSettings only merges known keys one at a time, so test sequential updates
    const updated = await service.updateSettings('alice', { displayName: 'Bob' });
    expect(updated.settings).toEqual({
      agentModel: 'opencode-go/kimi-k2.6',
      displayName: 'Bob',
    });
  });

  it('keeps an empty patch as a no-op', async () => {
    await service.updateSettings('alice', { agentModel: 'kimi-k2.6' });
    const before = await service.getSettings('alice');

    const noop = await service.updateSettings('alice', {});

    expect(noop).toEqual(before);
  });

  it('keeps user settings isolated per user', async () => {
    await service.updateSettings('alice', { agentModel: 'kimi-k2.6' });
    await service.updateSettings('bob', { agentModel: 'grok-4.6' });

    await expect(service.getSettings('alice')).resolves.toEqual({
      userId: 'alice',
      settings: { agentModel: 'opencode-go/kimi-k2.6' },
      updatedAt: expect.any(String),
    });
    await expect(service.getSettings('bob')).resolves.toEqual({
      userId: 'bob',
      settings: { agentModel: 'opencode-go/grok-4.6' },
      updatedAt: expect.any(String),
    });
  });

  it('does not fall back to memory when CosmosDB is required', async () => {
    process.env.COSMOSDB_REQUIRED = 'true';

    await expect(service.getSettings('alice')).rejects.toMatchObject({ statusCode: 503 });
    await expect(
      service.updateSettings('alice', { agentModel: 'kimi-k2.6' }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});

describe('Functions user settings service with CosmosDB available', () => {
  const originalCosmosRequired = process.env.COSMOSDB_REQUIRED;
  let service: typeof import('../../src/services/userSettingsService');

  beforeEach(() => {
    jest.resetModules();
    process.env.COSMOSDB_REQUIRED = 'false';
  });

  afterEach(() => {
    jest.resetModules();
  });

  afterAll(() => {
    if (originalCosmosRequired === undefined) delete process.env.COSMOSDB_REQUIRED;
    else process.env.COSMOSDB_REQUIRED = originalCosmosRequired;
  });

  it('point-reads and upserts a single document per user (id === userId)', async () => {
    const read = jest.fn().mockResolvedValue({ resource: undefined });
    const upsert = jest.fn().mockImplementation(async (doc) => ({ resource: doc }));
    const item = jest.fn(() => ({ read }));
    const container = {
      read: jest.fn().mockResolvedValue({}),
      items: { upsert },
      item,
    };
    jest.doMock('../../src/db', () => ({
      getUserSettingsContainer: jest.fn(() => container),
    }));
    const cosmosService = require('../../src/services/userSettingsService') as typeof service;

    await cosmosService.getSettings('alice');
    expect(item).toHaveBeenCalledWith('alice', 'alice');

    await cosmosService.updateSettings('alice', { agentModel: 'kimi-k2.6' });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'alice',
        userId: 'alice',
        settings: { agentModel: 'opencode-go/kimi-k2.6' },
      }),
    );
  });
});