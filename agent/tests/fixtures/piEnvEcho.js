/**
 * prompt に対し、注入された承認レベル env を text_delta で返すスタブ
 * （POST /prompt の approvalLevel/dangerousTools 配線テスト用）。
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
    if (parsed.type === 'prompt') {
      emit({ id: parsed.id, type: 'response', command: 'prompt', success: true });
      emit({ type: 'agent_start' });
      emit({
        type: 'message_update',
        assistantMessageEvent: {
          type: 'text_delta',
          contentIndex: 0,
          delta: `level=${process.env.APPROVAL_LEVEL || '(unset)'} tools=${process.env.APPROVAL_DANGEROUS_TOOLS || '(unset)'}`,
        },
      });
      emit({ type: 'agent_settled' });
    }
  }
});
