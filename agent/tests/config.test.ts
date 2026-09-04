import { loadAgentConfig } from '../src/config';

describe('loadAgentConfig', () => {
  it('appends the approval gate extension by default', () => {
    const config = loadAgentConfig({});
    const extIndex = config.pi.piArgs.indexOf('--extension');
    expect(extIndex).toBeGreaterThanOrEqual(0);
    expect(config.pi.piArgs[extIndex + 1]).toMatch(/approvalGate\.(js|ts)$/);
  });

  it('replaces extensions when AGENT_EXTENSIONS is set', () => {
    const config = loadAgentConfig({ AGENT_EXTENSIONS: '/x/gate.js, /y/other.js' });
    expect(config.pi.piArgs).toEqual(
      expect.arrayContaining(['--extension', '/x/gate.js', '--extension', '/y/other.js']),
    );
    expect(config.pi.piArgs.join(' ')).not.toContain('approvalGate');
  });

  it('sanitizes numeric env values', () => {
    const config = loadAgentConfig({ GATEWAY_MAX_RUNS: 'abc', GATEWAY_PORT: '9999' });
    expect(config.gateway.maxRuns).toBe(4);
    expect(config.port).toBe(9999);
  });

  it('defaults to loopback binding', () => {
    expect(loadAgentConfig({}).host).toBe('127.0.0.1');
    expect(loadAgentConfig({ GATEWAY_HOST: '0.0.0.0' }).host).toBe('0.0.0.0');
  });
});
