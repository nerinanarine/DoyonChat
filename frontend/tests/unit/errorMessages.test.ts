import { describe, expect, it } from 'vitest';
import { ApiError } from '../../src/services/api';
import {
  ChatStreamError,
  classifyError,
  errorMessage,
  SAFE_ERROR_MESSAGES,
} from '../../src/services/errorMessages';

describe('error message mapping', () => {
  it.each([
    [429, 'rate_limit'],
    [408, 'timeout'],
    [504, 'timeout'],
    [401, 'authentication'],
    [403, 'authentication'],
    [500, 'server'],
    [503, 'server'],
    [400, 'network'],
  ])('classifies ApiError status %i as %s', (status, code) => {
    expect(classifyError(new ApiError(status, 'raw body'))).toBe(code);
  });

  it('maps a ChatStreamError by its safe code', () => {
    const error = new ChatStreamError('rate_limit');
    expect(errorMessage(error)).toBe(
      'リクエストが多すぎます。しばらく待ってから再試行してください。',
    );
  });

  it('maps unknown errors to a safe network message without leaking details', () => {
    const message = errorMessage(new Error('secret upstream body'));
    expect(message).toBe(SAFE_ERROR_MESSAGES.network);
    expect(message).not.toContain('secret upstream body');
  });

  it('never exposes raw HTTP response bodies in user-facing messages', () => {
    const message = errorMessage(new ApiError(503, 'Authorization: Bearer secret-key-value'));
    expect(message).toBe(SAFE_ERROR_MESSAGES.server);
    expect(message).not.toContain('secret-key-value');
  });
});