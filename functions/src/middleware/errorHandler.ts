import { HttpResponseInit } from '@azure/functions';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function toHttpResponse(error: unknown): HttpResponseInit {
  const normalized = error instanceof Error ? error : new Error(String(error));
  console.error(`[Functions Error] ${normalized.message}`, normalized.stack);

  if (error instanceof AppError) {
    return {
      status: error.statusCode,
      jsonBody: { error: error.message },
    };
  }

  return {
    status: 500,
    jsonBody: { error: 'Internal server error' },
  };
}
