/**
 * pi RPC モード用の JSONL ストリームパーサ。
 *
 * プロトコルは LF (`\n`) のみをレコード区切りとする（`docs/rpc.md` Framing）。
 * Node 標準の `readline` は U+2028 / U+2029 でも分割してしまうためプロトコル非準拠。
 * 本実装は `\n` のみで分割し、末尾の `\r`（`\r\n` 混在の許容）を除去する。
 * JSON 文字列内に含まれる U+2028 / U+2029 はそのままペイロードとして保持される。
 */
export class JsonlStreamParser {
  private buffer = '';

  /** チャンクを投入し、完成した行（`\n` 区切り・空行除く）を返す。 */
  feed(chunk: string): string[] {
    this.buffer += chunk;
    const lines: string[] = [];
    let idx: number;
    while ((idx = this.buffer.indexOf('\n')) !== -1) {
      let line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line.length > 0) lines.push(line);
    }
    return lines;
  }

  /** ストリーム終端時の残バッファを1行として返す（末尾改行なしの最終行）。 */
  flush(): string[] {
    const rest = this.buffer;
    this.buffer = '';
    if (rest.length === 0) return [];
    const line = rest.endsWith('\r') ? rest.slice(0, -1) : rest;
    return line.length > 0 ? [line] : [];
  }

  get remainder(): string {
    return this.buffer;
  }
}

/** 行を JSON として解釈する。非 JSON 行は null を返す（エラー送出はしない）。 */
export function parseJsonLine(line: string): unknown {
  try {
    return JSON.parse(line) as unknown;
  } catch {
    return null;
  }
}