/**
 * pi RPC のプロトコル準拠スタブ（テスト用）。
 * - LF (`\n`) のみで入力行を分割する（readline 不使用）
 * - get_state に応答する
 * - prompt を受けると scripted イベント列を emit し、agent_settled で終了する
 *   (prompt 本文を text_delta でエコーするため、往復が検証できる)
 */
'use strict';

process.stdin.setEncoding('utf8');
let buffer = '';

function emit(payload) {
  process.stdout.write(JSON.stringify(payload) + '\n');
}

function handle(cmd) {
  if (cmd.type === 'get_state') {
    emit({
      id: cmd.id,
      type: 'response',
      command: 'get_state',
      success: true,
      data: { isStreaming: false, messageCount: 0 },
    });
    return;
  }
  if (cmd.type === 'prompt') {
    const message = typeof cmd.message === 'string' ? cmd.message : '';
    emit({ id: cmd.id, type: 'response', command: 'prompt', success: true });
    emit({ type: 'agent_start' });
    emit({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'echo: ' + message },
    });
    emit({ type: 'message_end', message: { role: 'assistant', content: 'echo: ' + message } });
    emit({ type: 'agent_end', messages: [], willRetry: false });
    emit({ type: 'agent_settled' });
    return;
  }
  emit({ id: cmd.id, type: 'response', command: cmd.type, success: false, error: 'unsupported' });
}

process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 1);
    const trimmed = line.replace(/\r$/, '').trim();
    if (trimmed) {
      let parsed;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        continue;
      }
      handle(parsed);
    }
  }
});