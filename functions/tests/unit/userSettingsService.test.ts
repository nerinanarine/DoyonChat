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

  it('merges defaultModel and returns it on subsequent reads', async () => {
    const updated = await service.updateSettings('alice', { defaultModel: 'kimi-k2.6' });

    expect(updated.userId).toBe('alice');
    expect(updated.settings).toEqual({ defaultModel: 'kimi-k2.6' });
    await expect(service.getSettings('alice')).resolves.toEqual(updated);
  });

  it('removes defaultModel when patched with null', async () => {
    await service.updateSettings('alice', { defaultModel: 'kimi-k2.6' });

    const cleared = await service.updateSettings('alice', { defaultModel: null });

    expect(cleared.settings).toEqual({});
    await expect(service.getSettings('alice')).resolves.toEqual(cleared);
  });

  it('ignores reserved and unknown keys, applying only defaultModel', async () => {
    const updated = await service.updateSettings('alice', {
      id: 'spoofed',
      userId: 'bob',
      settings: { defaultModel: 'grok-4.5' },
      theme: 'dark',
      defaultModel: 'kimi-k2.6',
    });

    expect(updated.userId).toBe('alice');
    expect(updated.settings).toEqual({ defaultModel: 'kimi-k2.6' });
  });

  it('keeps an empty patch as a no-op', async () => {
    await service.updateSettings('alice', { defaultModel: 'kimi-k2.6' });
    const before = await service.getSettings('alice');

    const noop = await service.updateSettings('alice', {});

    expect(noop).toEqual(before);
  });

  it('keeps user settings isolated per user', async () => {
    await service.updateSettings('alice', { defaultModel: 'kimi-k2.6' });
    await service.updateSettings('bob', { defaultModel: 'grok-4.5' });

    await expect(service.getSettings('alice')).resolves.toEqual({
      userId: 'alice',
      settings: { defaultModel: 'kimi-k2.6' },
      updatedAt: expect.any(String),
    });
    await expect(service.getSettings('bob')).resolves.toEqual({
      userId: 'bob',
      settings: { defaultModel: 'grok-4.5' },
      updatedAt: expect.any(String),
    });
  });

  it('does not fall back to memory when CosmosDB is required', async () => {
    process.env.COSMOSDB_REQUIRED = 'true';

    await expect(service.getSettings('alice')).rejects.toMatchObject({ statusCode: 503 });
    await expect(
      service.updateSettings('alice', { defaultModel: 'kimi-k2.6' }),
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

    await cosmosService.updateSettings('alice', { defaultModel: 'kimi-k2.6' });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'alice',
        userId: 'alice',
        settings: { defaultModel: 'kimi-k2.6' },
      }),
    );
  });

  it('excludes a removed-from-catalog defaultModel from the response without rewriting', async () => {
    const storedDocument = {
      id: 'alice',
      userId: 'alice',
      settings: { defaultModel: 'retired-model' },
      updatedAt: '2026-08-22T00:00:00.000Z',
    };
    const read = jest.fn().mockResolvedValue({ resource: storedDocument });
    const upsert = jest.fn();
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

    const response = await cosmosService.getSettings('alice');

    expect(response).toEqual({
      userId: 'alice',
      settings: {},
      updatedAt: '2026-08-22T00:00:00.000Z',
    });
    expect(upsert).not.toHaveBeenCalled();
  });
});