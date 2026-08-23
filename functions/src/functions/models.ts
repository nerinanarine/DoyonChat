import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { authenticateRequest } from '../middleware/auth';
import { toHttpResponse } from '../middleware/errorHandler';
import { PUBLIC_MODELS } from '../config/modelCatalog';

export async function modelsHandler(
  request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    await authenticateRequest(request);
    return { status: 200, jsonBody: PUBLIC_MODELS };
  } catch (error) {
    return toHttpResponse(error);
  }
}

app.http('models', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'models',
  handler: modelsHandler,
});
