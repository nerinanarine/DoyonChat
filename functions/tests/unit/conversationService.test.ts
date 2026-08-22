describe('Functions conversation service', () => {
  const originalAuthEnabled = process.env.AUTH_ENABLED;
  const originalCosmosRequired = process.env.COSMOSDB_REQUIRED;
  let service: typeof import('../../src/services/conversationService');

  beforeEach(() => {
    jest.resetModules();
    process.env.AUTH_ENABLED = 'true';
    process.env.COSMOSDB_REQUIRED = 'false';

    const unavailableContainer = {
      read: jest.fn().mockRejectedValue(new Error('CosmosDB unavailable')),
    };
    jest.doMock('../../src/db', () => ({
      getConversationsContainer: jest.fn(() => unavailableContainer),
      getMessagesContainer: jest.fn(() => unavailableContainer),
    }));

    service = require('../../src/services/conversationService');
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

  it('scopes conversations and messages by userId', async () => {
    const alice = await service.createConversation('Alice', 'kimi-k2.6', 'alice');
    const bob = await service.createConversation('Bob', 'kimi-k2.6', 'bob');

    expect((await service.listConversations('alice')).map((item) => item.id)).toEqual([alice.id]);
    await expect(service.getConversation(bob.id, 'alice')).resolves.toBeNull();
    await expect(service.updateConversationModel(bob.id, 'glm-5.1', 'alice')).resolves.toBeNull();
    await expect(service.updateConversationTitle(bob.id, 'Renamed', 'alice')).resolves.toBeNull();
    await expect(service.deleteConversation(bob.id, 'alice')).resolves.toBe(false);
  });

  it('updates only the title in the in-memory store', async () => {
    const conversation = await service.createConversation('Original', 'kimi-k2.6', 'alice');

    const updated = await service.updateConversationTitle(
      conversation.id,
      'Renamed',
      'alice',
    );

    expect(updated).toEqual({ ...conversation, title: 'Renamed' });
    await expect(service.getConversation(conversation.id, 'alice')).resolves.toEqual(updated);
  });

  it('replaces a Cosmos DB conversation without changing fields other than title', async () => {
    jest.resetModules();
    const conversation = {
      id: 'conversation-id',
      userId: 'alice',
      title: 'Original',
      model: 'kimi-k2.6',
      createdAt: '2026-08-22T00:00:00.000Z',
      updatedAt: '2026-08-22T01:00:00.000Z',
    };
    const read = jest.fn().mockResolvedValue({ resource: conversation });
    const replace = jest.fn().mockImplementation(async (updated) => ({ resource: updated }));
    const item = jest.fn(() => ({ read, replace }));
    const container = { read: jest.fn().mockResolvedValue({}), item };
    jest.doMock('../../src/db', () => ({
      getConversationsContainer: jest.fn(() => container),
      getMessagesContainer: jest.fn(() => container),
    }));
    const cosmosService = require('../../src/services/conversationService') as typeof service;

    const updated = await cosmosService.updateConversationTitle(
      conversation.id,
      'Renamed',
      'alice',
    );

    expect(updated).toEqual({ ...conversation, title: 'Renamed' });
    expect(replace).toHaveBeenCalledWith({ ...conversation, title: 'Renamed' });
    expect(item).toHaveBeenCalledWith(conversation.id, conversation.id);
  });

  it('shares data when authentication is disabled', async () => {
    const conversation = await service.createConversation('Shared', 'kimi-k2.6', 'alice');
    process.env.AUTH_ENABLED = 'false';

    expect((await service.listConversations('dev-user')).map((item) => item.id)).toContain(
      conversation.id,
    );
    const developmentConversation = await service.createConversation();
    expect(developmentConversation.userId).toBe('dev-user');
  });

  it('does not fall back to memory when CosmosDB is required', async () => {
    process.env.COSMOSDB_REQUIRED = 'true';

    await expect(service.createConversation('Unavailable', 'kimi-k2.6', 'alice')).rejects.toMatchObject(
      { statusCode: 503 },
    );
    await expect(
      service.updateConversationTitle('conversation-id', 'Renamed', 'alice'),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});
