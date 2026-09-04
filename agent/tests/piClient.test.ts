import path from 'node:path';
import { PiClient } from '../src/piClient';

const STUB = path.join(__dirname, 'fixtures', 'piStub.js');
const CRASH = path.join(__dirname, 'fixtures', 'piCrash.js');
const SILENT = path.join(__dirname, 'fixtures', 'piSilent.js');

function optsFor(fixture: string) {
  return {
    piBin: process.execPath,
    piArgs: [fixture],
    promptTimeoutMs: 10_000,
  };
}

describe('PiClient (stub pi)', () => {
  it('relays prompt through to agent_settled and accumulates text', async () => {
    const client = new PiClient(optsFor(STUB));
    const forwarded: unknown[] = [];
    const result = await client.runPrompt('hello world', {
      onEvent: (event) => forwarded.push(event),
    });

    expect(result.settled).toBe(true);
    expect(result.finalText).toBe('echo: hello world');
    expect(
      forwarded.some((e) => (e as { type?: string }).type === 'agent_start'),
    ).toBe(true);
    expect(
      forwarded.some((e) => (e as { type?: string }).type === 'agent_settled'),
    ).toBe(true);
    await client.terminate();
  });

  it('handles U+2028/U+2029 in a prompt payload end-to-end', async () => {
    const client = new PiClient(optsFor(STUB));
    const message = 'a\u2028b\u2029c';
    const result = await client.runPrompt(message);
    expect(result.settled).toBe(true);
    expect(result.finalText).toBe(`echo: a\u2028b\u2029c`);
    await client.terminate();
  });

  it('round-trips a non-LLM command (get_state) via correlated id', async () => {
    const client = new PiClient(optsFor(STUB));
    const response = await client.command({ type: 'get_state' });
    expect(response.type).toBe('response');
    expect(response.command).toBe('get_state');
    expect(response.success).toBe(true);
    await client.terminate();
  });

  it('rejects with server code and reclaims process on abnormal exit', async () => {
    const client = new PiClient(optsFor(CRASH));
    await expect(client.runPrompt('boom')).rejects.toMatchObject({
      code: 'server',
    });
    expect(client.hasExited).toBe(true);
    expect(client.isRunning).toBe(false);
  });

  it('rejects with timeout code and reclaims process when pi never settles', async () => {
    const client = new PiClient({ ...optsFor(SILENT), promptTimeoutMs: 500 });
    await expect(client.runPrompt('slow')).rejects.toMatchObject({
      code: 'timeout',
    });
    await client.terminate();
    expect(client.hasExited).toBe(true);
    expect(client.isRunning).toBe(false);
  });

  it('terminate() reclaims a running process', async () => {
    const client = new PiClient(optsFor(SILENT));
    await client.start();
    expect(client.isRunning).toBe(true);
    await client.terminate();
    expect(client.hasExited).toBe(true);
    expect(client.isRunning).toBe(false);
  });
});