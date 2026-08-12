import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import conversationsRouter from '../../src/routes/conversations';
import chatRouter from '../../src/routes/chat';
import { errorHandler } from '../../src/middleware/errorHandler';

jest.mock('../../src/db/index', () => {
  const unavailableContainer = {
    read: jest.fn().mockRejectedValue(new Error('CosmosDB unavailable')),
  };

  return {
    getConversationsContainer: jest.fn(() => unavailableContainer),
    getMessagesContainer: jest.fn(() => unavailableContainer),
  };
});

describe('chat ownership API', () => {
  const originalAuthEnabled = process.env.AUTH_ENABLED;
  const originalApiKey = process.env.OPENCODE_GO_API_KEY;
  let app: express.Express;

  beforeEach(() => {
    process.env.AUTH_ENABLED = 'true';
    process.env.OPENCODE_GO_API_KEY = 'sk-test-key';
    app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.userId = req.header('x-user-id') || 'dev-user';
      next();
    });
    app.use('/api/conversations', conversationsRouter);
    app.use('/api/chat', chatRouter);
    app.use(errorHandler);
  });

  afterAll(() => {
    if (originalAuthEnabled === undefined) {
      delete process.env.AUTH_ENABLED;
    } else {
      process.env.AUTH_ENABLED = originalAuthEnabled;
    }
    if (originalApiKey === undefined) {
      delete process.env.OPENCODE_GO_API_KEY;
    } else {
      process.env.OPENCODE_GO_API_KEY = originalApiKey;
    }
  });

  it('rejects chat requests for another user\'s conversation', async () => {
    const createResponse = await request(app)
      .post('/api/conversations')
      .set('x-user-id', 'alice')
      .send({ title: 'Alice chat' });
    const conversationId = createResponse.body.id as string;

    const response = await request(app)
      .post('/api/chat')
      .set('x-user-id', 'bob')
      .send({ conversationId, message: 'Should be rejected' });

    expect(response.status).toBe(404);
  });

  it('saves an authorized user message and streamed assistant response', async () => {
    const createResponse = await request(app)
      .post('/api/conversations')
      .set('x-user-id', 'alice')
      .send({ title: 'Alice chat' });
    const conversationId = createResponse.body.id as string;

    const response = await request(app)
      .post('/api/chat')
      .set('x-user-id', 'alice')
      .send({ conversationId, message: 'Hello' });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/event-stream/);
    expect(response.text).toContain('"done":true');

    const messagesResponse = await request(app)
      .get(`/api/conversations/${conversationId}/messages`)
      .set('x-user-id', 'alice');
    expect(messagesResponse.status).toBe(200);
    expect(messagesResponse.body).toHaveLength(2);
    expect(messagesResponse.body.map((message: { role: string }) => message.role)).toEqual([
      'user',
      'assistant',
    ]);
  });
});
