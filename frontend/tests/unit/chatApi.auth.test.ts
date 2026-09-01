import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  logoutRedirect: vi.fn().mockResolvedValue(undefined),
  getAllAccounts: vi.fn().mockReturnValue([{ homeAccountId: 'account-1' }]),
  acquireTokenSilent: vi.fn().mockResolvedValue({ accessToken: 'access-token' }),
  fetch: vi.fn(),
}));

vi.stubEnv('VITE_AUTH_ENABLED', 'true');
vi.mock('../../src/auth/msalConfig', () => ({
  msalInstance: {
    logoutRedirect: mocks.logoutRedirect,
    getAllAccounts: mocks.getAllAccounts,
    acquireTokenSilent: mocks.acquireTokenSilent,
  },
  apiScope: 'api://test/access_as_user',
  loginRequest: { scopes: [] },
}));

global.fetch = mocks.fetch;

let streamChat: typeof import('../../src/services/chatApi').streamChat;

beforeAll(async () => {
  ({ streamChat } = await import('../../src/services/chatApi'));
});

describe('chat stream authentication errors', () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.logoutRedirect.mockClear();
    mocks.acquireTokenSilent.mockClear();
    mocks.acquireTokenSilent.mockResolvedValue({ accessToken: 'access-token' });
  });

  it('logs out on an authenticated 401 without exposing it as an API-key error', async () => {
    mocks.fetch.mockResolvedValueOnce({ ok: false, status: 401, body: null });
    const errors: Error[] = [];
    let doneCount = 0;

    streamChat(
      'conversation-1',
      '質問',
      undefined,
      undefined,
      () => {
        doneCount += 1;
      },
      (error) => {
        errors.push(error);
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.logoutRedirect).toHaveBeenCalledTimes(1);
    expect(errors).toHaveLength(0);
    expect(doneCount).toBe(0);
  });
});
