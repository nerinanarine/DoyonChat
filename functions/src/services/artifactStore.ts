import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AppError } from '../middleware/errorHandler';

/**
 * ユーザー専用 artifacts 共有の読み取り（P3-016 FR-003）。
 *
 * 配信経路（Phase 0 確定）: Functions が Azure Files 共有を直接読む（gateway 経由の proxy は使わない）。
 * - 共有ルートは agent gateway の `<dataDir>/artifacts` マウントに対応し、共有内は `{userId}/{fileName}` 配置
 *   （agent の `artifactsUserDir` と同型。`agent/src/sessions.ts`）。
 * - Storage キーは Key Vault secret `artifacts-storage-key` を参照する app setting
 *   `ARTIFACTS_STORAGE_KEY` から供給する（平文キーをコード・env 例・ログに置かない）。
 * - dev/test は `AGENT_DATA_DIR` 配下のローカル FS へフォールバックする（実 Azure には触れない）。
 *
 * セキュリティ: userId / fileName は単一セグメントに限定して検証し、パストラバーサルを不可能にする。
 */

// agent/src/sessions.ts の SAFE_ID と同型（`{userId}` 配置規約を踏襲）
const SAFE_USER_ID = /^[A-Za-z0-9_-]{1,128}$/;
// ファイル名は単一セグメント。拡張子のドットは許可し、パス区切りは正規表現で排除する。
const SAFE_FILE_NAME = /^[A-Za-z0-9._-]{1,255}$/;

// ユーザー設定（AGENTS.md）の共有内配置（P2-020 FR-003）。正本は `artifacts/{userId}/config/AGENTS.md`。
const USER_CONFIG_SUBDIR = 'config';
const AGENTS_MD_FILE = 'AGENTS.md';
/** AGENTS.md の保存上限（100KB）。spec の既定案に合わせる（P2-020 edge case、FR edge）。 */
export const MAX_USER_AGENTS_MD_BYTES = 100 * 1024;

export function assertSafeUserId(userId: unknown): string {
  if (typeof userId !== 'string' || !SAFE_USER_ID.test(userId)) {
    throw new AppError(400, 'invalid userId');
  }
  return userId;
}

export function assertSafeFileName(fileName: unknown): string {
  if (
    typeof fileName !== 'string' ||
    !SAFE_FILE_NAME.test(fileName) ||
    fileName === '.' ||
    fileName === '..'
  ) {
    throw new AppError(400, 'invalid file name');
  }
  return fileName;
}

export interface ArtifactStoreConfig {
  /** dev/test フォールバックのローカルルート。`<localDataDir>/artifacts/{userId}/...` を読む。空なら Azure Files。 */
  localDataDir: string;
  storageAccount: string;
  shareName: string;
  /** Key Vault 参照 app setting（secret: artifacts-storage-key）。 */
  storageKey: string;
  /** Storage エンドポイント suffix（既定: core.windows.net）。 */
  endpointSuffix: string;
}

export function loadArtifactStoreConfig(env: NodeJS.ProcessEnv = process.env): ArtifactStoreConfig {
  return {
    localDataDir: env.AGENT_DATA_DIR || '',
    storageAccount: env.ARTIFACTS_STORAGE_ACCOUNT || '',
    shareName: env.ARTIFACTS_SHARE_NAME || 'artifacts',
    storageKey: env.ARTIFACTS_STORAGE_KEY || '',
    endpointSuffix: env.ARTIFACTS_STORAGE_ENDPOINT_SUFFIX || 'core.windows.net',
  };
}

const CONTENT_TYPES: Record<string, string> = {
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.zip': 'application/zip',
};

export function artifactContentType(fileName: string): string {
  return CONTENT_TYPES[path.extname(fileName).toLowerCase()] ?? 'application/octet-stream';
}

export interface ArtifactFile {
  data: Buffer;
  contentType: string;
}

/** 共有内の相対パス `{userId}/{fileName}`（agent の `<dataDir>/artifacts/{userId}` に対応）。 */
function artifactSharePath(userId: string, fileName: string): string {
  return `${assertSafeUserId(userId)}/${assertSafeFileName(fileName)}`;
}

/** dev/test フォールバックのローカルパス（agent の artifactsUserDir と同型）。 */
function artifactLocalPath(localDataDir: string, userId: string, fileName: string): string {
  return path.join(localDataDir, 'artifacts', assertSafeUserId(userId), assertSafeFileName(fileName));
}

/** 共有内の AGENTS.md 相対パス `{userId}/config/AGENTS.md`（agent の `<dataDir>/artifacts/{userId}/config` に対応）。 */
function userAgentsMdSharePath(userId: string): string {
  return `${assertSafeUserId(userId)}/${USER_CONFIG_SUBDIR}/${AGENTS_MD_FILE}`;
}

/** dev/test フォールバックのローカルパス（agent の `<dataDir>/artifacts/{userId}/config` と同型）。 */
function userAgentsMdLocalPath(localDataDir: string, userId: string): string {
  return path.join(
    localDataDir,
    'artifacts',
    assertSafeUserId(userId),
    USER_CONFIG_SUBDIR,
    AGENTS_MD_FILE,
  );
}

/**
 * 所有者ディレクトリ配下のファイルを読む。ローカル設定時は FS、それ以外は Azure Files 共有を読む。
 * 不在は 404、共有設定不備は 503、共有エラーは 502 に正規化する。
 */
export async function readArtifactFile(
  config: ArtifactStoreConfig,
  userId: string,
  fileName: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ArtifactFile> {
  const safeUserId = assertSafeUserId(userId);
  const safeFileName = assertSafeFileName(fileName);
  if (config.localDataDir) {
    return readLocalArtifact(config.localDataDir, safeUserId, safeFileName);
  }
  return readShareArtifact(config, safeUserId, safeFileName, fetchImpl);
}

async function readLocalArtifact(
  localDataDir: string,
  userId: string,
  fileName: string,
): Promise<ArtifactFile> {
  try {
    const data = await fs.promises.readFile(artifactLocalPath(localDataDir, userId, fileName));
    return { data, contentType: artifactContentType(fileName) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new AppError(404, 'Artifact not found');
    }
    throw error;
  }
}

async function readShareArtifact(
  config: ArtifactStoreConfig,
  userId: string,
  fileName: string,
  fetchImpl: typeof fetch,
): Promise<ArtifactFile> {
  assertShareConfigured(config);
  const url = new URL(
    `https://${config.storageAccount}.file.${config.endpointSuffix}/` +
      `${config.shareName}/${artifactSharePath(userId, fileName)}`,
  );
  const response = await fetchImpl(url.toString(), {
    method: 'GET',
    headers: buildSharedKeyHeaders(config, {
      method: 'GET',
      resourcePath: url.pathname,
      xmsHeaders: {},
    }),
  });
  if (response.status === 404) throw new AppError(404, 'Artifact not found');
  if (!response.ok) throw new AppError(502, 'Artifact storage error');
  const data = Buffer.from(await response.arrayBuffer());
  return { data, contentType: artifactContentType(fileName) };
}

function assertShareConfigured(config: ArtifactStoreConfig): void {
  if (!config.storageAccount || !config.storageKey) {
    throw new AppError(503, 'Artifact storage is not configured');
  }
}

function userAgentsMdShareUrl(config: ArtifactStoreConfig, userId: string): URL {
  return new URL(
    `https://${config.storageAccount}.file.${config.endpointSuffix}/` +
      `${config.shareName}/${userAgentsMdSharePath(userId)}`,
  );
}

/**
 * ユーザー AGENTS.md（P2-020）を共有から読む。ローカル設定時は FS、それ以外は Azure Files 共有。
 * 未設定は 404、共有設定不備は 503、共有エラーは 502 に正規化する。
 */
export async function readUserAgentsMd(
  config: ArtifactStoreConfig,
  userId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const safeUserId = assertSafeUserId(userId);
  if (config.localDataDir) {
    return readLocalUserAgentsMd(config.localDataDir, safeUserId);
  }
  assertShareConfigured(config);
  const url = userAgentsMdShareUrl(config, safeUserId);
  const response = await fetchImpl(url.toString(), {
    method: 'GET',
    headers: buildSharedKeyHeaders(config, {
      method: 'GET',
      resourcePath: url.pathname,
      xmsHeaders: {},
    }),
  });
  if (response.status === 404) throw new AppError(404, 'AGENTS.md not found');
  if (!response.ok) throw new AppError(502, 'Artifact storage error');
  return Buffer.from(await response.arrayBuffer()).toString('utf8');
}

async function readLocalUserAgentsMd(localDataDir: string, userId: string): Promise<string> {
  try {
    return await fs.promises.readFile(userAgentsMdLocalPath(localDataDir, userId), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new AppError(404, 'AGENTS.md not found');
    }
    throw error;
  }
}

/**
 * ユーザー AGENTS.md を共有へ upsert する（P2-020 FR-002/FR-003）。
 * Azure Files では先に `config/` Directory を作成してから PUT する。
 * GET と違い本体書込みのため、Content-Length を含む PUT 用 SharedKey 署名を使う。
 */
export async function writeUserAgentsMd(
  config: ArtifactStoreConfig,
  userId: string,
  content: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const safeUserId = assertSafeUserId(userId);
  if (config.localDataDir) {
    const file = userAgentsMdLocalPath(config.localDataDir, safeUserId);
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(file, content, 'utf8');
    return;
  }
  assertShareConfigured(config);
  await createShareDirectory(config, safeUserId, fetchImpl);
  const body = Buffer.from(content, 'utf8');
  const url = userAgentsMdShareUrl(config, safeUserId);
  const response = await fetchImpl(url.toString(), {
    method: 'PUT',
    headers: {
      ...buildSharedKeyHeaders(config, {
        method: 'PUT',
        resourcePath: url.pathname,
        xmsHeaders: {
          'x-ms-type': 'file',
          'x-ms-content-length': String(body.length),
        },
        contentLength: String(body.length),
      }),
      'Content-Length': String(body.length),
    },
    body,
  });
  if (!response.ok) throw new AppError(502, 'Artifact storage error');
}

/**
 * ユーザー AGENTS.md を共有から削除する（P2-020 FR-004 のクリア）。既に無い場合は成功扱い。
 */
export async function deleteUserAgentsMd(
  config: ArtifactStoreConfig,
  userId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const safeUserId = assertSafeUserId(userId);
  if (config.localDataDir) {
    try {
      await fs.promises.unlink(userAgentsMdLocalPath(config.localDataDir, safeUserId));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    return;
  }
  assertShareConfigured(config);
  const url = userAgentsMdShareUrl(config, safeUserId);
  const response = await fetchImpl(url.toString(), {
    method: 'DELETE',
    headers: buildSharedKeyHeaders(config, {
      method: 'DELETE',
      resourcePath: url.pathname,
      xmsHeaders: {},
    }),
  });
  if (response.status === 404) return;
  if (!response.ok) throw new AppError(502, 'Artifact storage error');
}

/**
 * `{userId}/config` Directory を作成する（P2-020 FR-003）。Azure Files の Create Directory。
 * 既存ディレクトリは 409 DirectoryAlreadyExists を返すため成功扱いにする。
 */
async function createShareDirectory(
  config: ArtifactStoreConfig,
  userId: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  const url = new URL(
    `https://${config.storageAccount}.file.${config.endpointSuffix}/` +
      `${config.shareName}/${userId}/${USER_CONFIG_SUBDIR}?restype=directory`,
  );
  const response = await fetchImpl(url.toString(), {
    method: 'PUT',
    headers: buildSharedKeyHeaders(config, {
      method: 'PUT',
      resourcePath: url.pathname,
      xmsHeaders: {},
      query: { restype: 'directory' },
    }),
  });
  if (!response.ok && response.status !== 409) {
    throw new AppError(502, 'Artifact storage error');
  }
}

interface SharedKeyRequest {
  method: string;
  /** 署名対象のリソースパス（共有名以降。URL クエリは含めない）。 */
  resourcePath: string;
  /** `x-ms-*` ヘッダ（辞書順にソートして CanonicalizedHeaders に使う）。 */
  xmsHeaders: Record<string, string>;
  /** Content-Length（PUT 系のみ）。未指定は空。 */
  contentLength?: string;
  /** CanonicalizedResource に追記するクエリ（`restype=directory` 等、辞書順）。 */
  query?: Record<string, string>;
}

/**
 * Azure Files SharedKey 認証ヘッダを組み立てる（`x-ms-date` + HMAC-SHA256 署名）。
 * GET は content 系が空、PUT（Directory 作成・本体書込み）は Content-Length を署名に含める。
 * CanonicalizedHeaders は `x-ms-*` を辞書順に並べる。
 */
function buildSharedKeyHeaders(
  config: Pick<ArtifactStoreConfig, 'storageAccount' | 'storageKey'>,
  request: SharedKeyRequest,
  now: Date = new Date(),
): Record<string, string> {
  const date = now.toUTCString();
  const version = '2021-12-02';
  const xmsHeaders: Record<string, string> = {
    'x-ms-date': date,
    'x-ms-version': version,
    ...request.xmsHeaders,
  };
  const canonicalizedHeaders = Object.keys(xmsHeaders)
    .sort()
    .map((key) => `${key}:${xmsHeaders[key]}\n`)
    .join('');
  let canonicalizedResource = `/${config.storageAccount}${request.resourcePath}`;
  for (const key of Object.keys(request.query ?? {}).sort()) {
    canonicalizedResource += `\n${key}:${request.query![key]}`;
  }
  // VERB + Content-Encoding/Language/Length/MD5/Type + Date + 条件ヘッダ + Range
  const contentFields = [
    request.method,
    '', // Content-Encoding
    '', // Content-Language
    request.contentLength ?? '', // Content-Length
    '', // Content-MD5
    '', // Content-Type
    '', // Date
    '', // If-Modified-Since
    '', // If-Match
    '', // If-None-Match
    '', // If-Unmodified-Since
    '', // Range
  ];
  const stringToSign = `${contentFields.join('\n')}\n${canonicalizedHeaders}${canonicalizedResource}`;
  const signature = crypto
    .createHmac('sha256', Buffer.from(config.storageKey, 'base64'))
    .update(stringToSign, 'utf8')
    .digest('base64');
  return {
    ...xmsHeaders,
    Authorization: `SharedKey ${config.storageAccount}:${signature}`,
  };
}
