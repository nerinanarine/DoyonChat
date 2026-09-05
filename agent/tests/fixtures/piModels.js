/**
 * get_available_models / set_model に応答するスタブ（モデルカタログテスト用）。
 */
'use strict';

process.stdin.setEncoding('utf8');
let buffer = '';

const MODELS = [
  { id: 'good-model', name: 'Good Model', provider: 'test-provider' },
  { id: 'other-model', name: 'Other Model', provider: 'other-provider' },
];

function emit(payload) {
  process.stdout.write(JSON.stringify(payload) + '\n');
}

process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 1);
    const trimmed = line.replace(/\r$/, '').trim();
    if (!trimmed) continue;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (parsed.type === 'get_available_models') {
      emit({
        id: parsed.id,
        type: 'response',
        command: 'get_available_models',
        success: true,
        data: { models: MODELS },
      });
      continue;
    }
    if (parsed.type === 'set_model') {
      const ok = parsed.modelId !== 'fail-model';
      emit({
        id: parsed.id,
        type: 'response',
        command: 'set_model',
        success: ok,
        data: ok ? { provider: parsed.provider, modelId: parsed.modelId } : undefined,
      });
      continue;
    }
    if (parsed.type === 'switch_session') {
      emit({ id: parsed.id, type: 'response', command: 'switch_session', success: true });
      continue;
    }
    if (parsed.type === 'prompt') {
      emit({ id: parsed.id, type: 'response', command: 'prompt', success: true });
      emit({ type: 'agent_start' });
      emit({
        type: 'message_update',
        assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'model-ok' },
      });
      emit({ type: 'agent_settled' });
    }
  }
});
