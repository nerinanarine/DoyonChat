import { HttpRequest } from '@azure/functions';
import { AppError } from '../middleware/errorHandler';

export async function readJsonBody(request: HttpRequest): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new AppError(400, 'Request body must be a JSON object');
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, 'Invalid JSON body');
  }
}

export function getRequiredString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError(400, `${field} is required`);
  }
  return value;
}

export function getOptionalString(
  body: Record<string, unknown>,
  field: string,
): string | undefined {
  const value = body[field];
  return typeof value === 'string' ? value : undefined;
}
