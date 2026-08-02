describe('Functions legacy conversation handling', () => {
  const originalAuthEnabled = process.env.AUTH_ENABLED;
  let service: typeof import('../../src/services/conversationService');
  let query: jest.Mock;
  let readItem: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    process.env.AUTH_ENABLED = 'true';
    process.env.COSMOSDB_REQUIRED = 'false';

    query = jest.fn().mockReturnValue({
      fetchAll: jest.fn().mockResolvedValue({ resources: [] }),
    });
    readItem = jest.fn().mockResolvedValue({
      resource: {
        id: 'legacy-conversation',
        title: 'Legacy chat',
        model: 'kimi-k2.6',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });

    const conversationsContainer = {
      read: jest.fn().mockResolvedValue({}),
      items: { query },
      item: jest.fn(() => ({ read: readItem })),
    };
    const messagesContainer = {
      read: jest.fn().mockResolvedValue({}),
    };

    jest.doMock('../../src/db', () => ({
      getConversationsContainer: jest.fn(() => conversationsContainer),
      getMessagesContainer: jest.fn(() => messagesContainer),
    }));

    service = require('../../src/services/conversationService');
  });

  afterEach(() => {
    jest.resetModules();
  });

  afterAll(() => {
    if (originalAuthEnabled === undefined) delete process.env.AUTH_ENABLED;
    else process.env.AUTH_ENABLED = originalAuthEnabled;
  });

  it('hides a legacy conversation without userId when authentication is enabled', async () => {
    await expect(service.getConversation('legacy-conversation', 'alice')).resolves.toBeNull();

    await service.listConversations('alice');
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining('IS_DEFINED(c.userId)'),
        parameters: [{ name: '@userId', value: 'alice' }],
      }),
    );
  });
});
