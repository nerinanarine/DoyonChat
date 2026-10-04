import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import { authenticateRequest } from '../middleware/auth';
import { AppError, toHttpResponse } from '../middleware/errorHandler';
import {
  assertSafeFileName,
  assertSafeUserId,
  loadArtifactStoreConfig,
  readArtifactFile,
} from '../services/artifactStore';

/**
 * ユーザー専用 artifacts のダウンロード配信（P3-016 FR-003/FR-005）。
 *
 * 所有者検証は `agent.ts` の verifyRunOwnership 規約を踏襲し、パスの `{userId}` が
 * 認証済み userId と一致しない場合は 404 を返す（他ユーザー領域の存在を漏らさない）。
 * パスは `artifacts/{userId}/{fileName}` 配置に解決し、単一セグメント検証で
 * パストラバーサルを不可能にする。
 */
function notFoundArtifactError(): AppError {
  return new AppError(404, 'Artifact not found');
}

export async function agentArtifactHandler(
  request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const authUserId = await authenticateRequest(request);
    // 先にパスを検証（不正な id・traversal は 400）
    const userId = assertSafeUserId(request.params.userId);
    const fileName = assertSafeFileName(request.params.fileName);

    // 所有者検証: 認証済みユーザー以外の領域は 404（存在を漏らさない）
    if (userId !== authUserId) throw notFoundArtifactError();

    const file = await readArtifactFile(loadArtifactStoreConfig(), userId, fileName);
    return {
      status: 200,
      headers: {
        'Content-Type': file.contentType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': String(file.data.length),
      },
      body: file.data,
    };
  } catch (error) {
    return toHttpResponse(error);
  }
}

app.http('agent-artifact', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'agent/artifacts/{userId}/{fileName}',
  handler: agentArtifactHandler,
});
