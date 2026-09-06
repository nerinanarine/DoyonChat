import { spawnSync } from 'node:child_process';
import { loadAgentConfig } from '../src/config';
import { PiClient } from '../src/piClient';

/**
 * 実 pi (`--mode rpc`) に対して LLM を消費しない get_state のみを往復させる。
 * pi が PATH に無い場合（または AGENT_SKIP_REAL_PI=1）はスキップする。
 */
const SKIP_REAL = process.env.AGENT_SKIP_REAL_PI === '1';

function piAvailable(): boolean {
  const config = loadAgentConfig();
  // Windows では npm シェルシム対策で node + cli.js に解決される
  const probeArgs =
    config.pi.piArgs[0]?.endsWith('.js') && config.pi.piBin === process.execPath
      ? [config.pi.piArgs[0], '--version']
      : ['--version'];
  const result = spawnSync(config.pi.piBin, probeArgs, {
    encoding: 'utf8',
    timeout: 15_000,
    windowsHide: true,
  });
  return result.status === 0;
}

const available = !SKIP_REAL && piAvailable();

(available ? describe : describe.skip)('real pi RPC (get_state, non-LLM)', () => {
  it('round-trips get_state against real pi', async () => {
    const config = loadAgentConfig();
    const client = new PiClient(config.pi);
    await client.start();
    try {
      const response = await client.command({ type: 'get_state' }, 20_000);
      expect(response).toMatchObject({
        type: 'response',
        command: 'get_state',
        success: true,
      });
      expect((response as { data?: unknown }).data).toBeDefined();
    } finally {
      await client.terminate();
    }
  }, 30_000);
});