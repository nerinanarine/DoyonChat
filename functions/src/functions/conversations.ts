import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import { authenticateRequest } from '../middleware/auth';
import { AppError, toHttpResponse } from '../middleware/errorHandler';
import * as service from '../services/conversationService';
import { DEFAULT_MODEL_ID, hasModel } from '../config/modelCatalog';
import { getOptionalString, getRequiredString, readJsonBody } from './request';

function getConversationId(request: HttpRequest): string {
  const id = request.params.id;
  if (!id) throw new AppError(400, 'conversation id is required');
  return id;
}

export async function conversationsHandler(
  request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const userId = await authenticateRequest(request);
    if (request.method === 'GET') {
      return { status: 200, jsonBody: await service.listConversations(userId) };
    }

    const body = await readJsonBody(request);
    const model = Object.prototype.hasOwnProperty.call(body, 'model')
      ? getRequiredString(body, 'model')
      : DEFAULT_MODEL_ID;
    if (!hasModel(model)) {
      throw new AppError(400, 'model is not supported');
    }
    const conversation = await service.createConversation(
      getOptionalString(body, 'title'),
      model,
      userId,
    );
    return { status: 201, jsonBody: conversation };
  } catch (error) {
    return toHttpResponse(error);
  }
}

export async function conversationHandler(
  request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const userId = await authenticateRequest(request);
    const id = getConversationId(request);
    const conversation = await service.getConversation(id, userId);
    if (!conversation) throw new AppError(404, 'Conversation not found');

    if (request.method === 'GET') {
      const messages = await service.listMessages(id, userId);
      return { status: 200, jsonBody: { conversation, messages } };
    }

    const deleted = await service.deleteConversation(id, userId);
    if (!deleted) throw new AppError(404, 'Conversation not found');
    return { status: 204 };
  } catch (error) {
    return toHttpResponse(error);
  }
}

export async function modelHandler(
  request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const userId = await authenticateRequest(request);
    const body = await readJsonBody(request);
    const model = getRequiredString(body, 'model');
    if (!hasModel(model)) {
      throw new AppError(400, 'model is not supported');
    }
    const updated = await service.updateConversationModel(
      getConversationId(request),
      model,
      userId,
    );
    if (!updated) throw new AppError(404, 'Conversation not found');
    return { status: 200, jsonBody: updated };
  } catch (error) {
    return toHttpResponse(error);
  }
}

export async function titleHandler(
  request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const userId = await authenticateRequest(request);
    const body = await readJsonBody(request);
    const title = getRequiredString(body, 'title').trim();
    if (Array.from(title).length > 100) {
      throw new AppError(400, 'title must be 100 characters or fewer');
    }
    const updated = await service.updateConversationTitle(
      getConversationId(request),
      title,
      userId,
    );
    if (!updated) throw new AppError(404, 'Conversation not found');
    return { status: 200, jsonBody: updated };
  } catch (error) {
    return toHttpResponse(error);
  }
}

app.http('conversations', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: 'conversations',
  handler: conversationsHandler,
});

app.http('conversation', {
  methods: ['GET', 'DELETE'],
  authLevel: 'anonymous',
  route: 'conversations/{id}',
  handler: conversationHandler,
});

app.http('conversation-model', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'conversations/{id}/model',
  handler: modelHandler,
});

app.http('conversation-title', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'conversations/{id}/title',
  handler: titleHandler,
});
