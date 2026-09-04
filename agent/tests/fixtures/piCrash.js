/**
 * prompt を受けて応答を返さず異常終了するスタブ（異常終了時の回収テスト用）。
 */
'use strict';

process.stdin.setEncoding('utf8');
let buffer = '';

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
      // 応答も agent_settled も送らずに異常終了する
      process.exit(1);
    }
  }
});

// 入力が無いままの起動でも一定時間後に終了する（ハング防止）
setTimeout(() => process.exit(1), 5000);