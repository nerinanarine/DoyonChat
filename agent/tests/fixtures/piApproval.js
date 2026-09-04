/**
 * prompt に対して confirm 承認を要求するスタブ。
 * extension_ui_response の内容を環境変数 PI_APPROVAL_RESULT_FILE に追記する（テスト検証用）。
 */
'use strict';

const fs = require('node:fs');

process.stdin.setEncoding('utf8');
let buffer = '';

function emit(payload) {
  process.stdout.write(JSON.stringify(payload) + '\n');
}

function recordResponse(payload) {
  const file = process.env.PI_APPROVAL_RESULT_FILE;
  if (!file) return;
  fs.appendFileSync(file, JSON.stringify(payload) + '\n');
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
        type: 'extension_ui_request',
        id: 'appr-1',
        method: 'confirm',
        title: 'ツール実行の確認: read',
        message: 'read src/index.ts',
      });
    }
    if (parsed.type === 'extension_ui_response' && parsed.id === 'appr-1') {
      recordResponse(parsed);
      if (parsed.confirmed === true) {
        emit({
          type: 'tool_execution_start',
          toolCallId: 'call-1',
          toolName: 'read',
          args: { path: 'src/index.ts' },
        });
        emit({
          type: 'tool_execution_end',
          toolCallId: 'call-1',
          toolName: 'read',
          result: { content: [{ type: 'text', text: 'file content' }] },
          isError: false,
        });
        emit({
          type: 'message_update',
          assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'approved-result' },
        });
      } else {
        emit({
          type: 'message_update',
          assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'blocked-result' },
        });
      }
      emit({ type: 'agent_settled' });
    }
  }
});
