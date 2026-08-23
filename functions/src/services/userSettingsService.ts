import { UserSettings, UserSettingsDocument, UserSettingsResponse } from '../types';
import { hasModel } from '../config/modelCatalog';
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

// Invalid (removed-from-catalog) defaultModel is excluded from responses
// without rewriting the stored document. See spec FR-007.
function sanitizeSettings(settings: UserSettings): UserSettings {
  const sanitized: UserSettings = {};
  if (settings.defaultModel !== undefined && hasModel(settings.defaultModel)) {
    sanitized.defaultModel = settings.defaultModel;
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
  if (!Object.prototype.hasOwnProperty.call(partial, 'defaultModel')) {
    return toResponse(existing, userId);
  }

  // Only the known key `defaultModel` is merged (reserved/unknown keys are ignored).
  const settings: UserSettings = { ...existing?.settings };
  const value = partial.defaultModel;
  if (value === null) {
    delete settings.defaultModel;
  } else if (typeof value === 'string') {
    settings.defaultModel = value;
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