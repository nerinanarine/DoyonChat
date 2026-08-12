import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import { authenticateRequest } from '../middleware/auth';
import { AppError, toHttpResponse } from '../middleware/errorHandler';
import * as service from '../services/conversationService';

export async function messagesHandler(
  request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const userId = await authenticateRequest(request);
    const conversationId = request.params.id;
    if (!conversationId) throw new AppError(400, 'conversation id is required');

    const conversation = await service.getConversation(conversationId, userId);
    if (!conversation) throw new AppError(404, 'Conversation not found');

    return {
      status: 200,
      jsonBody: await service.listMessages(conversationId, userId),
    };
  } catch (error) {
    return toHttpResponse(error);
  }
}

app.http('conversation-messages', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'conversations/{id}/messages',
  handler: messagesHandler,
});
