import { MODEL_CATALOG } from '../src/config/modelCatalog';
import { streamChat } from '../src/services/opencodeGo';
import {
  LiveModelResult,
  resolveLiveApiKey,
  runLiveModelChecks,
} from './modelLiveHarness';

describe('OpenCode Go official model catalog', () => {
  it('completes a real text chat with every model', async () => {
    process.env.OPENCODE_GO_API_KEY = resolveLiveApiKey();

    const targets = MODEL_CATALOG.map(({ info, protocol }) => ({
      modelId: info.id,
      protocol,
    }));
    const results = await runLiveModelChecks(
      targets,
      ({ modelId }, signal) =>
        streamChat([{ role: 'user', content: 'Reply only OK' }], {
          model: modelId,
          maxTokens: 512,
          signal,
        }),
      {
        timeoutMs: 120_000,
        onResult: logSafeResult,
      },
    );

    const failures = results.filter(({ ok }) => !ok);
    if (failures.length > 0) {
      const summary = failures
        .map(({ modelId, protocol, classification }) =>
          `${modelId} (${protocol}): ${classification}`,
        )
        .join(', ');
      throw new Error(`Live model checks failed: ${summary}`);
    }

    expect(results).toHaveLength(27);
  });
});

function logSafeResult(result: LiveModelResult): void {
  const status = result.ok ? 'PASS' : 'FAIL';
  console.log(
    `${result.modelId} ${result.protocol} ${status} ${result.durationMs}ms ${result.classification}`,
  );
}
