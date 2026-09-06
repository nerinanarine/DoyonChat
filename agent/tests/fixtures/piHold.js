/**
 * 会話対応＋ホールドするスタブ（実行中ガードテスト用）。
 * - switch_session には success を返す
 * - prompt には応答を返すが agent_settled を送らない → run は running のまま
 * - abort には honor して settled を返す
 */
'use strict';

process.stdin.setEncoding('utf8');
let buffer = '';

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
    if (parsed.type === 'switch_session') {
      emit({ id: parsed.id, type: 'response', command: 'switch_session', success: true });
      continue;
    }
    if (parsed.type === 'abort') {
      emit({
        type: 'message_update',
        assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'partial' },
      });
      emit({ type: 'agent_settled' });
      continue;
    }
    if (parsed.type === 'prompt') {
      emit({ id: parsed.id, type: 'response', command: 'prompt', success: true });
      emit({ type: 'agent_start' });
      emit({
        type: 'message_update',
        assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'partial' },
      });
      // agent_settled は送らない → 実行中ガードが有効なまま
    }
  }
});