import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import { authenticateRequest } from '../middleware/auth';
import { AppError, toHttpResponse } from '../middleware/errorHandler';
import {
  MAX_USER_AGENTS_MD_BYTES,
  deleteUserAgentsMd,
  loadArtifactStoreConfig,
  readUserAgentsMd,
  writeUserAgentsMd,
} from '../services/artifactStore';
import { readJsonBody } from './request';

/**
 * ユーザー AGENTS.md の取得・保存 API（P2-020 FR-001/FR-002/FR-005）。
 *
 * `users/me/settings` と同型の所有者スコープ API。認証済み userId の文書のみを扱い、
 * パスに他ユーザーの id を取らないため存在漏洩の余地がない（userId の検証は
 * artifactStore 側の assertSafeUserId が担う）。素のファイル書込み口は設けない。
 * 正本は Azure Files 共有 `artifacts/{userId}/config/AGENTS.md`。未設定の GET は 404。
 */
export async function userAgentsMdHandler(
  request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const userId = await authenticateRequest(request);
    const config = loadArtifactStoreConfig();

    if (request.method === 'GET') {
      const content = await readUserAgentsMd(config, userId);
      return { status: 200, jsonBody: { userId, content } };
    }

    const body = await readJsonBody(request);
    const value = body.content;
    // 空（クリア）は共有上のコピーを削除する（FR-004。userConfigDir 側は
    // gateway のプロンプト毎再配置で削除される）。null もクリアとして扱う。
    if (value === null || value === '') {
      await deleteUserAgentsMd(config, userId);
      return { status: 200, jsonBody: { userId, content: '' } };
    }
    if (typeof value !== 'string') {
      throw new AppError(400, 'content must be a string');
    }
    if (Buffer.byteLength(value, 'utf8') > MAX_USER_AGENTS_MD_BYTES) {
      throw new AppError(400, `content must be ${MAX_USER_AGENTS_MD_BYTES} bytes or less`);
    }
    await writeUserAgentsMd(config, userId, value);
    return { status: 200, jsonBody: { userId, content: value } };
  } catch (error) {
    return toHttpResponse(error);
  }
}

app.http('user-agents-md', {
  methods: ['GET', 'PATCH'],
  authLevel: 'anonymous',
  route: 'users/me/agents-md',
  handler: userAgentsMdHandler,
});
