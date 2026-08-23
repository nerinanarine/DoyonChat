import {
  resolveLiveApiKey,
  runLiveModelChecks,
} from '../../live-tests/modelLiveHarness';

describe('model live test harness', () => {
  const originalApiKey = process.env.OPENCODE_GO_API_KEY;

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.OPENCODE_GO_API_KEY;
    else process.env.OPENCODE_GO_API_KEY = originalApiKey;
  });

  it('accepts a real key from the process environment', () => {
    process.env.OPENCODE_GO_API_KEY = 'sk-live-unit-test-value';
    expect(resolveLiveApiKey()).toBe('sk-live-unit-test-value');
  });

  it('rejects a template key before making requests', () => {
    process.env.OPENCODE_GO_API_KEY = 'sk-opencode-your-key-here';
    expect(resolveLiveApiKey).toThrow('is not configured with a real key');
  });

  it('requires content and a normal completion marker', async () => {
    const results = await runLiveModelChecks(
      [{ modelId: 'model-a', protocol: 'responses' }],
      async function* () {
        yield { content: 'OK', done: false };
        yield { content: '', done: true };
      },
    );

    expect(results).toEqual([
      expect.objectContaining({
        modelId: 'model-a',
        ok: true,
        classification: 'ok',
      }),
    ]);
  });

  it('classifies failures and continues through every model', async () => {
    const requested: string[] = [];
    const results = await runLiveModelChecks(
      [
        { modelId: 'incomplete', protocol: 'responses' },
        { modelId: 'upstream-eof', protocol: 'responses' },
        { modelId: 'empty', protocol: 'chat-completions' },
        { modelId: 'limited', protocol: 'messages' },
        { modelId: 'success', protocol: 'messages' },
      ],
      async function* ({ modelId }) {
        requested.push(modelId);
        if (modelId === 'incomplete') {
          yield { content: 'partial', done: false };
          return;
        }
        if (modelId === 'upstream-eof') {
          throw new Error('OpenCode Go stream ended before completion marker');
        }
        if (modelId === 'empty') {
          yield { content: '', done: true };
          return;
        }
        if (modelId === 'limited') {
          throw new Error('OpenCode Go API error (429): secret upstream body');
        }
        yield { content: 'OK', done: false };
        yield { content: '', done: true };
      },
    );

    expect(requested).toEqual([
      'incomplete',
      'upstream-eof',
      'empty',
      'limited',
      'success',
    ]);
    expect(results.map(({ classification }) => classification)).toEqual([
      'incomplete-stream',
      'incomplete-stream',
      'empty-content',
      'http-429',
      'ok',
    ]);
    expect(JSON.stringify(results)).not.toContain('secret upstream body');
  });

  it('aborts a timed-out stream and waits for it before starting the next model', async () => {
    const events: string[] = [];
    const results = await runLiveModelChecks(
      [
        { modelId: 'slow', protocol: 'responses' },
        { modelId: 'next', protocol: 'messages' },
      ],
      async function* ({ modelId }, signal) {
        events.push(`start:${modelId}`);
        if (modelId === 'slow') {
          await new Promise<void>((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => {
                events.push('abort:slow');
                const error = new Error('aborted');
                error.name = 'AbortError';
                events.push('settled:slow');
                reject(error);
              },
              { once: true },
            );
          });
        }
        yield { content: 'OK', done: false };
        yield { content: '', done: true };
      },
      { timeoutMs: 20 },
    );

    expect(events).toEqual([
      'start:slow',
      'abort:slow',
      'settled:slow',
      'start:next',
    ]);
    expect(results.map(({ classification }) => classification)).toEqual([
      'timeout',
      'ok',
    ]);
  });
});
