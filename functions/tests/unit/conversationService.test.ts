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

  it('updates agent mode in the in-memory store without touching other fields', async () => {
    const conversation = await service.createConversation('Agent chat', 'kimi-k2.6', 'alice');

    const enabled = await service.updateConversationAgentMode(conversation.id, true, 'alice');
    expect(enabled).toEqual({ ...conversation, agentMode: true });
    expect(enabled!.agentMode).toBe(true);

    const disabled = await service.updateConversationAgentMode(conversation.id, false, 'alice');
    expect(disabled).toEqual({ ...enabled, agentMode: false });

    // 他人の会話は所有者チェックで変更できない
    await expect(service.updateConversationAgentMode(conversation.id, true, 'bob')).resolves.toBeNull();
  });

  it('replaces a Cosmos DB conversation preserving agent mode on update', async () => {
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

    const updated = await cosmosService.updateConversationAgentMode(
      conversation.id,
      true,
      'alice',
    );

    expect(updated).toEqual({ ...conversation, agentMode: true });
    expect(replace).toHaveBeenCalledWith({ ...conversation, agentMode: true });
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

  it('adds a client-keyed user message only once across retries', async () => {
    const conversation = await service.createConversation('Retry chat', 'kimi-k2.6', 'alice');

    const first = await service.addMessageIfAbsent(
      {
        id: 'client-message-id',
        conversationId: conversation.id,
        role: 'user',
        content: 'hello',
      },
      'alice',
    );
    const second = await service.addMessageIfAbsent(
      {
        id: 'client-message-id',
        conversationId: conversation.id,
        role: 'user',
        content: 'hello',
      },
      'alice',
    );

    expect(second).toEqual(first);
    expect((await service.listMessages(conversation.id, 'alice'))).toHaveLength(1);
  });

  it('scopes idempotent user message saves to the conversation owner', async () => {
    const conversation = await service.createConversation('Bob retry', 'kimi-k2.6', 'bob');

    await expect(
      service.addMessageIfAbsent(
        {
          id: 'client-message-id',
          conversationId: conversation.id,
          role: 'user',
          content: 'hello',
        },
        'alice',
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.listMessages(conversation.id, 'alice')).resolves.toEqual([]);
  });

  it('reuses an existing Cosmos message on a 409 create conflict', async () => {
    jest.resetModules();
    const conversation = {
      id: 'conversation-id',
      userId: 'alice',
      title: 'Cosmos retry',
      model: 'kimi-k2.6',
      createdAt: '2026-08-22T00:00:00.000Z',
      updatedAt: '2026-08-22T01:00:00.000Z',
    };
    const existingMessage = {
      id: 'client-message-id',
      conversationId: conversation.id,
      role: 'user',
      content: 'hello',
      createdAt: '2026-08-22T01:00:00.000Z',
    };
    const create = jest.fn().mockRejectedValueOnce({ code: 409 });
    const messageRead = jest.fn().mockResolvedValue({ resource: existingMessage });
    const messageItem = jest.fn(() => ({ read: messageRead }));
    const conversationRead = jest.fn().mockResolvedValue({ resource: conversation });
    const conversationItem = jest.fn(() => ({ read: conversationRead }));
    const container = {
      read: jest.fn().mockResolvedValue({}),
      items: { create },
      item: conversationItem,
    };
    const messageContainer = {
      read: jest.fn().mockResolvedValue({}),
      items: { create },
      item: messageItem,
    };
    jest.doMock('../../src/db', () => ({
      getConversationsContainer: jest.fn(() => container),
      getMessagesContainer: jest.fn(() => messageContainer),
    }));
    const cosmosService = require('../../src/services/conversationService') as typeof service;
    process.env.COSMOSDB_REQUIRED = 'true';

    const result = await cosmosService.addMessageIfAbsent(
      {
        id: 'client-message-id',
        conversationId: conversation.id,
        role: 'user',
        content: 'hello',
      },
      'alice',
    );

    expect(result).toEqual(existingMessage);
    expect(messageItem).toHaveBeenCalledWith('client-message-id', conversation.id);
    process.env.COSMOSDB_REQUIRED = 'false';
  });
});
