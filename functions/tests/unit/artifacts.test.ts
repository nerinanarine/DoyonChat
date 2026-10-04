import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HttpRequest, HttpResponseInit } from '@azure/functions';
import { agentArtifactHandler } from '../../src/functions/artifacts';
import { assertSafeFileName, assertSafeUserId } from '../../src/services/artifactStore';

// 認証はテストでユーザーを切り替えるためモックする（実 JWKS には触れない）。
jest.mock('../../src/middleware/auth');
import { authenticateRequest } from '../../src/middleware/auth';
const mockedAuth = authenticateRequest as jest.MockedFunction<typeof authenticateRequest>;

function request(userId: string, fileName: string): HttpRequest {
  return new HttpRequest({
    method: 'GET',
    url: `http://localhost/api/agent/artifacts/${userId}/${fileName}`,
    params: { userId, fileName },
  });
}

function header(response: HttpResponseInit, name: string): string | undefined {
  return (response.headers as Record<string, string> | undefined)?.[name];
}

describe('Functions artifact download handler', () => {
  const originalEnv = process.env;
  let tmpDir: string;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.ARTIFACTS_STORAGE_ACCOUNT;
    delete process.env.ARTIFACTS_STORAGE_KEY;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-test-'));
    process.env.AGENT_DATA_DIR = tmpDir;
    mockedAuth.mockReset();
    mockedAuth.mockResolvedValue('user-a');
  });

  afterEach(() => {
    process.env = originalEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  function writeArtifact(userId: string, fileName: string, content: string): void {
    const dir = path.join(tmpDir, 'artifacts', userId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, fileName), content);
  }

  it("streams the owner's artifact from the local fallback with content headers", async () => {
    writeArtifact('user-a', 'report.txt', 'hello');

    const response = await agentArtifactHandler(request('user-a', 'report.txt'), {} as never);

    expect(response.status).toBe(200);
    expect(header(response, 'Content-Type')).toBe('text/plain; charset=utf-8');
    expect(header(response, 'Content-Disposition')).toBe('attachment; filename="report.txt"');
    expect(Buffer.from(response.body as Buffer).toString('utf8')).toBe('hello');
  });

  it('returns 404 for a missing artifact', async () => {
    const response = await agentArtifactHandler(request('user-a', 'missing.txt'), {} as never);
    expect(response.status).toBe(404);
  });

  it("denies another user's artifact with 404 (no existence leak)", async () => {
    writeArtifact('user-a', 'secret.txt', 'top secret');
    mockedAuth.mockResolvedValue('user-b');

    const response = await agentArtifactHandler(request('user-a', 'secret.txt'), {} as never);

    expect(response.status).toBe(404);
  });

  it('rejects path traversal in the file name with 400', async () => {
    const response = await agentArtifactHandler(request('user-a', '..'), {} as never);
    expect(response.status).toBe(400);
  });

  it('rejects unsafe ids and file names in the path helpers', () => {
    expect(() => assertSafeUserId('..')).toThrow('invalid userId');
    expect(() => assertSafeUserId('a/b')).toThrow('invalid userId');
    expect(() => assertSafeFileName('..')).toThrow('invalid file name');
    expect(() => assertSafeFileName('../secret')).toThrow('invalid file name');
    expect(assertSafeFileName('report.v2.pdf')).toBe('report.v2.pdf');
  });

  it('reads from the Azure Files share with a Key Vault-supplied key when configured', async () => {
    delete process.env.AGENT_DATA_DIR;
    process.env.ARTIFACTS_STORAGE_ACCOUNT = 'stacct';
    process.env.ARTIFACTS_STORAGE_KEY = Buffer.from('super-secret-key').toString('base64');
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array([104, 105]).buffer,
    } as Response);
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock);

    const response = await agentArtifactHandler(request('user-a', 'report.pdf'), {} as never);

    expect(response.status).toBe(200);
    expect(header(response, 'Content-Type')).toBe('application/pdf');
    expect(Buffer.from(response.body as Buffer).toString('utf8')).toBe('hi');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://stacct.file.core.windows.net/artifacts/user-a/report.pdf');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^SharedKey stacct:/);
    expect(headers['x-ms-version']).toBeDefined();
  });

  it('maps a share 404 to 404 and an unconfigured store to 503', async () => {
    delete process.env.AGENT_DATA_DIR;
    process.env.ARTIFACTS_STORAGE_ACCOUNT = 'stacct';
    process.env.ARTIFACTS_STORAGE_KEY = Buffer.from('key').toString('base64');
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 404 } as Response);
    expect((await agentArtifactHandler(request('user-a', 'x.txt'), {} as never)).status).toBe(404);

    delete process.env.ARTIFACTS_STORAGE_ACCOUNT;
    expect((await agentArtifactHandler(request('user-a', 'x.txt'), {} as never)).status).toBe(503);
  });
});
