import { AgentApprovalLevel, UserSettings, UserSettingsDocument, UserSettingsResponse } from '../types';
import { getUserSettingsContainer } from '../db';
import { AppError } from '../middleware/errorHandler';

let useMemory = false;
const memorySettings: Map<string, UserSettingsDocument> = new Map();

function isCosmosRequired(): boolean {
  return process.env.COSMOSDB_REQUIRED === 'true';
}

function databaseUnavailable(error: unknown): never {
  if (isCosmosRequired()) {
    throw new AppError(503, 'Database unavailable');
  }
  throw error;
}

async function ensureUserSettingsContainer(): Promise<void> {
  if (useMemory) return;
  try {
    await getUserSettingsContainer().read();
  } catch (error) {
    if (isCosmosRequired()) databaseUnavailable(error);
    useMemory = true;
    console.warn('[userSettingsService] CosmosDB unavailable, falling back to in-memory store');
  }
}

const AGENT_APPROVAL_LEVELS: readonly AgentApprovalLevel[] = [
  'auto',
  'dangerous-only',
  'always',
];

/** agentApprovalLevel の値域チェック（handler の 400 判定と sanitize で共用）。 */
export function isAgentApprovalLevel(value: unknown): value is AgentApprovalLevel {
  return (
    typeof value === 'string' &&
    (AGENT_APPROVAL_LEVELS as readonly string[]).includes(value)
  );
}

// Blank/out-of-domain values are excluded from responses without rewriting
// the stored document (stored as-is, like the agent keys below).
function sanitizeSettings(settings: UserSettings): UserSettings {
  const sanitized: UserSettings = {};
  if (settings.displayName !== undefined && settings.displayName.trim()) {
    sanitized.displayName = settings.displayName.trim();
  }
  // エージェント設定。値域外の agentApprovalLevel・空白のモデル名はレスポンスに含めない
  // （ストアド文書は書き換えずに除外する）。
  if (settings.agentApprovalLevel !== undefined && isAgentApprovalLevel(settings.agentApprovalLevel)) {
    sanitized.agentApprovalLevel = settings.agentApprovalLevel;
  }
  if (settings.agentModel !== undefined && settings.agentModel.trim()) {
    sanitized.agentModel = settings.agentModel.trim();
  }
  if (settings.agentSubagentModel !== undefined && settings.agentSubagentModel.trim()) {
    sanitized.agentSubagentModel = settings.agentSubagentModel.trim();
  }
  return sanitized;
}

function toResponse(document: UserSettingsDocument | null, userId: string): UserSettingsResponse {
  if (!document) return { userId, settings: {} };
  return {
    userId,
    settings: sanitizeSettings(document.settings),
    ...(document.updatedAt ? { updatedAt: document.updatedAt } : {}),
  };
}

async function readDocument(userId: string): Promise<UserSettingsDocument | null> {
  if (useMemory) return memorySettings.get(userId) || null;
  try {
    const { resource } = await getUserSettingsContainer().item(userId, userId).read();
    return (resource as UserSettingsDocument | undefined) || null;
  } catch (error) {
    if ((error as { code?: number }).code === 404) return null;
    return databaseUnavailable(error);
  }
}

export async function getSettings(userId: string): Promise<UserSettingsResponse> {
  await ensureUserSettingsContainer();
  return toResponse(await readDocument(userId), userId);
}

export async function updateSettings(
  userId: string,
  partial: Record<string, unknown>,
): Promise<UserSettingsResponse> {
  await ensureUserSettingsContainer();
  const existing = await readDocument(userId);

  // Empty body (no known keys) is a no-op returning current settings. Spec FR-005.
  const hasDisplayName = Object.prototype.hasOwnProperty.call(partial, 'displayName');
  const hasAgentApprovalLevel = Object.prototype.hasOwnProperty.call(partial, 'agentApprovalLevel');
  const hasAgentModel = Object.prototype.hasOwnProperty.call(partial, 'agentModel');
  const hasAgentSubagentModel = Object.prototype.hasOwnProperty.call(
    partial,
    'agentSubagentModel',
  );
  if (!hasDisplayName && !hasAgentApprovalLevel && !hasAgentModel && !hasAgentSubagentModel) {
    return toResponse(existing, userId);
  }

  // Only known keys are merged (reserved/unknown keys are ignored).
  const settings: UserSettings = { ...existing?.settings };

  if (hasDisplayName) {
    const value = partial.displayName;
    if (value === null || value === '') {
      delete settings.displayName;
    } else if (typeof value === 'string') {
      settings.displayName = value.trim();
    }
  }

  // 値域外の文字列はストアされるが、レスポンスでは sanitize が除外する。
  if (hasAgentApprovalLevel) {
    const value = partial.agentApprovalLevel;
    if (value === null) {
      delete settings.agentApprovalLevel;
    } else if (typeof value === 'string') {
      settings.agentApprovalLevel = value as AgentApprovalLevel;
    }
  }

  if (hasAgentModel) {
    const value = partial.agentModel;
    if (value === null || value === '') {
      delete settings.agentModel;
    } else if (typeof value === 'string') {
      settings.agentModel = value.trim();
    }
  }

  if (hasAgentSubagentModel) {
    const value = partial.agentSubagentModel;
    if (value === null || value === '') {
      delete settings.agentSubagentModel;
    } else if (typeof value === 'string') {
      settings.agentSubagentModel = value.trim();
    }
  }

  const now = new Date().toISOString();
  const document: UserSettingsDocument = {
    id: userId,
    userId,
    settings,
    updatedAt: now,
  };

  if (useMemory) {
    memorySettings.set(userId, document);
    return toResponse(document, userId);
  }

  try {
    await getUserSettingsContainer().items.upsert(document);
    return toResponse(document, userId);
  } catch (error) {
    return databaseUnavailable(error);
  }
}