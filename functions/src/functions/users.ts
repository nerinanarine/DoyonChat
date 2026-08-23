import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import { authenticateRequest } from '../middleware/auth';
import { AppError, toHttpResponse } from '../middleware/errorHandler';
import * as service from '../services/userSettingsService';
import { hasModel } from '../config/modelCatalog';
import { readJsonBody } from './request';

export async function userSettingsHandler(
  request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const userId = await authenticateRequest(request);
    if (request.method === 'GET') {
      return { status: 200, jsonBody: await service.getSettings(userId) };
    }

    const body = await readJsonBody(request);
    if (
      Object.prototype.hasOwnProperty.call(body, 'defaultModel') &&
      body.defaultModel !== null
    ) {
      const model = body.defaultModel;
      if (typeof model !== 'string' || !model.trim()) {
        throw new AppError(400, 'model is required');
      }
      if (!hasModel(model)) {
        throw new AppError(400, 'model is not supported');
      }
    }
    return { status: 200, jsonBody: await service.updateSettings(userId, body) };
  } catch (error) {
    return toHttpResponse(error);
  }
}

app.http('user-settings', {
  methods: ['GET', 'PATCH'],
  authLevel: 'anonymous',
  route: 'users/me/settings',
  handler: userSettingsHandler,
});