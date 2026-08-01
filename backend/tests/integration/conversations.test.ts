import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import conversationsRouter from '../../src/routes/conversations';
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

describe('conversation ownership API', () => {
  const originalAuthEnabled = process.env.AUTH_ENABLED;
  let app: express.Express;

  beforeEach(() => {
    process.env.AUTH_ENABLED = 'true';
    app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.userId = req.header('x-user-id') || 'dev-user';
      next();
    });
    app.use('/api/conversations', conversationsRouter);
    app.use(errorHandler);
  });

  afterAll(() => {
    if (originalAuthEnabled === undefined) {
      delete process.env.AUTH_ENABLED;
    } else {
      process.env.AUTH_ENABLED = originalAuthEnabled;
    }
  });

  it('does not expose one user\'s conversation to another user', async () => {
    const createResponse = await request(app)
      .post('/api/conversations')
      .set('x-user-id', 'alice')
      .send({ title: 'Alice chat', model: 'kimi-k2.6', userId: 'bob' });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.userId).toBe('alice');
    const conversationId = createResponse.body.id as string;

    const aliceList = await request(app)
      .get('/api/conversations')
      .set('x-user-id', 'alice');
    expect(aliceList.status).toBe(200);
    expect(aliceList.body).toHaveLength(1);

    const bobList = await request(app)
      .get('/api/conversations')
      .set('x-user-id', 'bob');
    expect(bobList.status).toBe(200);
    expect(bobList.body).toHaveLength(0);

    const bobDetail = await request(app)
      .get(`/api/conversations/${conversationId}`)
      .set('x-user-id', 'bob');
    expect(bobDetail.status).toBe(404);

    const bobMessages = await request(app)
      .get(`/api/conversations/${conversationId}/messages`)
      .set('x-user-id', 'bob');
    expect(bobMessages.status).toBe(404);

    const bobModelUpdate = await request(app)
      .put(`/api/conversations/${conversationId}/model`)
      .set('x-user-id', 'bob')
      .send({ model: 'glm-5.1' });
    expect(bobModelUpdate.status).toBe(404);

    const bobDelete = await request(app)
      .delete(`/api/conversations/${conversationId}`)
      .set('x-user-id', 'bob');
    expect(bobDelete.status).toBe(404);

    const aliceDelete = await request(app)
      .delete(`/api/conversations/${conversationId}`)
      .set('x-user-id', 'alice');
    expect(aliceDelete.status).toBe(204);
  });
});
