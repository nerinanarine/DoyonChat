import fs from 'node:fs';
import path from 'node:path';

import type { StreamChunk } from '../src/services/opencodeGo';

export interface LiveModelTarget {
  modelId: string;
  protocol: string;
}

export interface LiveModelResult extends LiveModelTarget {
  ok: boolean;
  durationMs: number;
  classification: string;
}

interface RunOptions {
  timeoutMs?: number;
  onResult?: (result: LiveModelResult) => void;
}

type StreamFactory = (
  target: LiveModelTarget,
  signal: AbortSignal,
) => AsyncIterable<StreamChunk>;

const TEMPLATE_KEYS = new Set([
  'sk-opencode-your-key-here',
  'test-key',
  'mock-key',
  'placeholder',
]);

export function resolveLiveApiKey(): string {
  const environmentKey = process.env.OPENCODE_GO_API_KEY?.trim();
  const key = environmentKey || readLocalSettingsKey();

  if (!key || TEMPLATE_KEYS.has(key.toLowerCase()) || /^<.*>$/.test(key)) {
    throw new Error(
      'OPENCODE_GO_API_KEY is not configured with a real key for live tests',
    );
  }

  return key;
}

function readLocalSettingsKey(): string | undefined {
  const settingsPath = path.resolve(__dirname, '../local.settings.json');
  if (!fs.existsSync(settingsPath)) return undefined;

  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
    Values?: { OPENCODE_GO_API_KEY?: unknown };
  };
  const value = settings.Values?.OPENCODE_GO_API_KEY;
  return typeof value === 'string' ? value.trim() : undefined;
}

export async function runLiveModelChecks(
  targets: LiveModelTarget[],
  createStream: StreamFactory,
  options: RunOptions = {},
): Promise<LiveModelResult[]> {
  const results: LiveModelResult[] = [];

  for (const target of targets) {
    const startedAt = Date.now();
    const controller = new AbortController();
    let timedOut = false;
    let hasContent = false;
    let completed = false;
    let classification = 'ok';
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, options.timeoutMs ?? 120_000);

    try {
      for await (const chunk of createStream(target, controller.signal)) {
        if (chunk.content.trim()) hasContent = true;
        if (chunk.done) completed = true;
      }

      if (timedOut) classification = 'timeout';
      else if (!completed) classification = 'incomplete-stream';
      else if (!hasContent) classification = 'empty-content';
    } catch (error) {
      classification = timedOut ? 'timeout' : classifyError(error);
    } finally {
      clearTimeout(timeout);
    }

    const result: LiveModelResult = {
      ...target,
      ok: classification === 'ok',
      durationMs: Date.now() - startedAt,
      classification,
    };
    results.push(result);
    options.onResult?.(result);
  }

  return results;
}

function classifyError(error: unknown): string {
  if (error instanceof Error && error.name === 'AbortError') return 'timeout';
  const message = error instanceof Error ? error.message : '';
  if (message.includes('stream ended before completion marker')) {
    return 'incomplete-stream';
  }
  const status = message.match(/API error \((\d{3})\)/)?.[1];
  return status ? `http-${status}` : 'stream-error';
}
