import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadAgentConfig, loadToolsAllowlist } from '../src/config';

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

  it('validates the default model at startup', () => {
    expect(loadAgentConfig({}).gateway.defaultModel).toBeUndefined();
    expect(
      loadAgentConfig({ AGENT_DEFAULT_MODEL: 'p1/a', AGENT_MODEL_SCOPE: 'p1/*' }).gateway.defaultModel,
    ).toBe('p1/a');
    expect(() => loadAgentConfig({ AGENT_DEFAULT_MODEL: 'bare' })).toThrow();
    expect(() => loadAgentConfig({ AGENT_DEFAULT_MODEL: 'p2/a', AGENT_MODEL_SCOPE: 'p1/*' })).toThrow();
  });

  it('resolves an explicit AGENT_WEB_ACCESS_INDEX and keeps it out of main args', () => {
    const fixture = path.join(os.tmpdir(), `pwa-index-${process.pid}.ts`);
    fs.writeFileSync(fixture, '// fixture\n');
    try {
      const config = loadAgentConfig({ AGENT_WEB_ACCESS_INDEX: fixture, AGENT_EXTENSIONS: '' });
      expect(config.gateway.webAccessIndex).toBe(fixture);
      // メインセッションには載せない（--extension に追加しない）
      expect(config.pi.piArgs.join(' ')).not.toContain(fixture);
      expect(config.pi.piArgs.join(' ')).not.toContain('--extension');
    } finally {
      fs.unlinkSync(fixture);
    }
  });

  it('fails closed when AGENT_WEB_ACCESS_INDEX points to a missing file', () => {
    expect(() => loadAgentConfig({ AGENT_WEB_ACCESS_INDEX: '/no/such/pwa/index.ts' })).toThrow(
      /AGENT_WEB_ACCESS_INDEX/,
    );
  });

  it('disables researcher web-access with an explicit empty AGENT_WEB_ACCESS_INDEX', () => {
    expect(loadAgentConfig({ AGENT_WEB_ACCESS_INDEX: '' }).gateway.webAccessIndex).toBeNull();
  });
});

describe('loadToolsAllowlist', () => {
  it('returns empty defaults for missing files', () => {
    expect(loadToolsAllowlist('/no/such/file.json')).toEqual({ tools: [], dangerous: [] });
  });

  it('throws on malformed JSON (fail-closed)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-tools-'));
    const file = path.join(dir, 'tools.allowlist.json');
    fs.writeFileSync(file, '{broken');
    expect(() => loadToolsAllowlist(file)).toThrow();
  });

  it('sanitizes entries', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-tools-'));
    const file = path.join(dir, 'tools.allowlist.json');
    fs.writeFileSync(
      file,
      JSON.stringify({ tools: ['read', '', 42, 'x'.repeat(65)], dangerous: ['read'] }),
    );
    expect(loadToolsAllowlist(file)).toEqual({ tools: ['read'], dangerous: ['read'] });
  });

  it('adds --tools only when the allowlist is non-empty', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-tools-'));
    const file = path.join(dir, 'tools.allowlist.json');
    fs.writeFileSync(file, JSON.stringify({ tools: ['read', 'grep'], dangerous: ['read'] }));
    const config = loadAgentConfig({ AGENT_TOOLS_FILE: file, AGENT_EXTENSIONS: '' });
    const toolsIndex = config.pi.piArgs.indexOf('--tools');
    expect(toolsIndex).toBeGreaterThanOrEqual(0);
    expect(config.pi.piArgs[toolsIndex + 1]).toBe('read,grep');
    expect(config.gateway.toolsDangerous).toEqual(['read']);
  });
});
