import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HttpRequest, HttpResponseInit } from '@azure/functions';
import { userAgentsMdHandler } from '../../src/functions/userAgentsMd';
import { MAX_USER_AGENTS_MD_BYTES } from '../../src/services/artifactStore';

// 認証はテストでユーザーを切り替えるためモックする（実 JWKS には触れない）。
jest.mock('../../src/middleware/auth');
import { authenticateRequest } from '../../src/middleware/auth';
const mockedAuth = authenticateRequest as jest.MockedFunction<typeof authenticateRequest>;

function request(method: string, body?: unknown): HttpRequest {
  return new HttpRequest({
    method,
    url: 'http://localhost/api/users/me/agents-md',
    body: body === undefined ? undefined : { string: JSON.stringify(body) },
  });
}

function json(response: HttpResponseInit): Record<string, unknown> {
  return response.jsonBody as Record<string, unknown>;
}

describe('Functions user AGENTS.md handler (P2-020)', () => {
  const originalEnv = process.env;
  let tmpDir: string;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.ARTIFACTS_STORAGE_ACCOUNT;
    delete process.env.ARTIFACTS_STORAGE_KEY;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-md-test-'));
    process.env.AGENT_DATA_DIR = tmpDir;
    mockedAuth.mockReset();
    mockedAuth.mockResolvedValue('user-a');
  });

  afterEach(() => {
    process.env = originalEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  function shareFile(userId: string): string {
    return path.join(tmpDir, 'artifacts', userId, 'config', 'AGENTS.md');
  }

  function seedShare(userId: string, content: string): void {
    fs.mkdirSync(path.dirname(shareFile(userId)), { recursive: true });
    fs.writeFileSync(shareFile(userId), content);
  }

  it("saves and re-reads the owner's AGENTS.md (local fallback)", async () => {
    const saved = await userAgentsMdHandler(request('PATCH', { content: '# hello' }), {} as never);
    expect(saved.status).toBe(200);
    expect(json(saved)).toEqual({ userId: 'user-a', content: '# hello' });
    expect(fs.readFileSync(shareFile('user-a'), 'utf8')).toBe('# hello');

    const fetched = await userAgentsMdHandler(request('GET'), {} as never);
    expect(fetched.status).toBe(200);
    expect(json(fetched)).toEqual({ userId: 'user-a', content: '# hello' });
  });

  it('returns 404 when the document is unset', async () => {
    const response = await userAgentsMdHandler(request('GET'), {} as never);
    expect(response.status).toBe(404);
  });

  it("denies another user's document with 404 (no existence leak)", async () => {
    seedShare('user-a', 'secret');
    mockedAuth.mockResolvedValue('user-b');

    const response = await userAgentsMdHandler(request('GET'), {} as never);

    expect(response.status).toBe(404);
  });

  it('rejects an unsafe authenticated id (traversal) with 400', async () => {
    mockedAuth.mockResolvedValue('../evil');
    const response = await userAgentsMdHandler(request('GET'), {} as never);
    expect(response.status).toBe(400);
  });

  it('clears both by deleting the share copy on empty content', async () => {
    seedShare('user-a', 'old');
    const response = await userAgentsMdHandler(request('PATCH', { content: '' }), {} as never);
    expect(response.status).toBe(200);
    expect(fs.existsSync(shareFile('user-a'))).toBe(false);
    expect((await userAgentsMdHandler(request('GET'), {} as never)).status).toBe(404);
  });

  it('rejects content beyond the size cap with 400', async () => {
    const oversized = 'x'.repeat(MAX_USER_AGENTS_MD_BYTES + 1);
    const response = await userAgentsMdHandler(request('PATCH', { content: oversized }), {} as never);
    expect(response.status).toBe(400);
    expect(fs.existsSync(shareFile('user-a'))).toBe(false);
  });

  it('rejects a non-string content with 400', async () => {
    const response = await userAgentsMdHandler(request('PATCH', { content: 42 }), {} as never);
    expect(response.status).toBe(400);
  });

  it('writes to the Azure Files share with a Create-Directory then PUT (SharedKey)', async () => {
    delete process.env.AGENT_DATA_DIR;
    process.env.ARTIFACTS_STORAGE_ACCOUNT = 'stacct';
    process.env.ARTIFACTS_STORAGE_KEY = Buffer.from('super-secret-key').toString('base64');
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 201 } as Response);
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock);

    const response = await userAgentsMdHandler(request('PATCH', { content: 'hi' }), {} as never);

    expect(response.status).toBe(200);
    const [dirUrl, dirInit] = fetchMock.mock.calls[0];
    expect(dirUrl).toBe(
      'https://stacct.file.core.windows.net/artifacts/user-a/config?restype=directory',
    );
    expect((dirInit as RequestInit).method).toBe('PUT');
    const [fileUrl, fileInit] = fetchMock.mock.calls[1];
    expect(fileUrl).toBe(
      'https://stacct.file.core.windows.net/artifacts/user-a/config/AGENTS.md',
    );
    const headers = (fileInit as RequestInit).headers as Record<string, string>;
    expect((fileInit as RequestInit).method).toBe('PUT');
    expect(headers.Authorization).toMatch(/^SharedKey stacct:/);
    expect(headers['x-ms-type']).toBe('file');
    expect(headers['x-ms-content-length']).toBe('2');
  });

  it('maps a share 404 to 404 and deletes on clear via DELETE', async () => {
    delete process.env.AGENT_DATA_DIR;
    process.env.ARTIFACTS_STORAGE_ACCOUNT = 'stacct';
    process.env.ARTIFACTS_STORAGE_KEY = Buffer.from('key').toString('base64');
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response)
      .mockResolvedValueOnce({ ok: true, status: 202 } as Response);
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock);

    expect((await userAgentsMdHandler(request('GET'), {} as never)).status).toBe(404);
    expect((await userAgentsMdHandler(request('PATCH', { content: '' }), {} as never)).status).toBe(
      200,
    );

    const [deleteUrl, deleteInit] = fetchMock.mock.calls[1];
    expect(deleteUrl).toBe(
      'https://stacct.file.core.windows.net/artifacts/user-a/config/AGENTS.md',
    );
    expect((deleteInit as RequestInit).method).toBe('DELETE');
  });

  it('maps an unconfigured store to 503', async () => {
    delete process.env.AGENT_DATA_DIR;
    const response = await userAgentsMdHandler(request('GET'), {} as never);
    expect(response.status).toBe(503);
  });
});
