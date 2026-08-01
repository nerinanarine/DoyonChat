describe('conversation service user scoping', () => {
  const originalAuthEnabled = process.env.AUTH_ENABLED;
  let service: typeof import('../../src/services/conversationService');

  beforeEach(() => {
    jest.resetModules();
    process.env.AUTH_ENABLED = 'true';

    const unavailableContainer = {
      read: jest.fn().mockRejectedValue(new Error('CosmosDB unavailable')),
    };

    jest.doMock('../../src/db/index', () => ({
      getConversationsContainer: jest.fn(() => unavailableContainer),
      getMessagesContainer: jest.fn(() => unavailableContainer),
    }));

    service = require('../../src/services/conversationService');
  });

  afterEach(() => {
    jest.resetModules();
  });

  afterAll(() => {
    if (originalAuthEnabled === undefined) {
      delete process.env.AUTH_ENABLED;
    } else {
      process.env.AUTH_ENABLED = originalAuthEnabled;
    }
  });

  it('scopes conversations and messages to the authenticated user', async () => {
    const aliceConversation = await service.createConversation('Alice chat', 'kimi-k2.6', 'alice');
    const bobConversation = await service.createConversation('Bob chat', 'kimi-k2.6', 'bob');

    expect((await service.listConversations('alice')).map((conversation) => conversation.id)).toEqual([
      aliceConversation.id,
    ]);
    expect(await service.getConversation(bobConversation.id, 'alice')).toBeNull();
    expect(await service.updateConversationModel(bobConversation.id, 'glm-5.1', 'alice')).toBeNull();
    expect(await service.deleteConversation(bobConversation.id, 'alice')).toBe(false);

    await service.addMessage(
      {
        conversationId: aliceConversation.id,
        role: 'user',
        content: 'Alice message',
      },
      'alice',
    );

    expect(await service.listMessages(aliceConversation.id, 'bob')).toEqual([]);
    expect((await service.listMessages(aliceConversation.id, 'alice'))).toHaveLength(1);
  });

  it('shares all conversations and assigns dev-user when auth is disabled', async () => {
    const conversation = await service.createConversation('Shared chat', 'kimi-k2.6', 'alice');

    process.env.AUTH_ENABLED = 'false';

    expect((await service.listConversations('dev-user')).map((item) => item.id)).toContain(
      conversation.id,
    );
    expect(await service.getConversation(conversation.id, 'dev-user')).toEqual(conversation);

    const developmentConversation = await service.createConversation();
    expect(developmentConversation.userId).toBe('dev-user');
  });
});
