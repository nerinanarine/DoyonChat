import { JsonlStreamParser, parseJsonLine } from '../src/jsonl';

describe('JsonlStreamParser', () => {
  it('splits records on LF only', () => {
    const parser = new JsonlStreamParser();
    expect(parser.feed('{"a":1}\n{"b":2}\n')).toEqual(['{"a":1}', '{"b":2}']);
  });

  it('does not split on U+2028/U+2029 inside a JSON string (readline compliance)', () => {
    const parser = new JsonlStreamParser();
    const payload = { type: 'message_update', delta: 'line\u2028sep\u2029x' };
    const serialized = JSON.stringify(payload);
    // JSON.stringify は U+2028/U+2029 をエスケープしない（実文字が含まれる）
    expect(serialized).toContain('\u2028');
    expect(serialized).toContain('\u2029');

    const lines = parser.feed(`${serialized}\n`);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(serialized);
    expect(parseJsonLine(lines[0])).toEqual(payload);
  });

  it('preserves complete records across chunk boundaries', () => {
    const parser = new JsonlStreamParser();
    const serialized = '{"type":"agent_start"}\n{"type":"agent_settled"}\n';
    const splitAt = serialized.indexOf('settled') - 1; // 2行目の途中で分割
    expect(splitAt).toBeGreaterThan(serialized.indexOf('\n'));

    expect(parser.feed(serialized.slice(0, splitAt))).toEqual([
      '{"type":"agent_start"}',
    ]);
    expect(parser.feed(serialized.slice(splitAt))).toEqual([
      '{"type":"agent_settled"}',
    ]);
  });

  it('strips a trailing CR so CRLF input is tolerated', () => {
    const parser = new JsonlStreamParser();
    expect(parser.feed('{"a":1}\r\n{"b":2}\r\n')).toEqual([
      '{"a":1}',
      '{"b":2}',
    ]);
  });

  it('skips empty lines and exposes remainder', () => {
    const parser = new JsonlStreamParser();
    expect(parser.feed('\n\n')).toEqual([]);
    parser.feed('{"a":1}');
    expect(parser.remainder).toBe('{"a":1}');
  });

  it('flush returns an unterminated final line once', () => {
    const parser = new JsonlStreamParser();
    parser.feed('{"a":1}\n{"b":2}');
    expect(parser.flush()).toEqual(['{"b":2}']);
    expect(parser.flush()).toEqual([]);
  });

  it('parseJsonLine returns null for malformed input', () => {
    expect(parseJsonLine('not json')).toBeNull();
    expect(parseJsonLine('')).toBeNull();
  });
});