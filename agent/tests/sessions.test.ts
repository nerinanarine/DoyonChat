import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertSafeId,
  deleteSessionFile,
  sessionFilePath,
  userConfigDir,
  writeUserAgentSettings,
} from '../src/sessions';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gw-sess-'));
}

describe('assertSafeId', () => {
  it('accepts safe ids and rejects traversal', () => {
    expect(assertSafeId('userId', 'user-1_abc')).toBe('user-1_abc');
    for (const bad of ['../x', 'a/b', '', 'x'.repeat(129), 42, null]) {
      expect(() => assertSafeId('userId', bad)).toThrow();
    }
  });
});

describe('session paths', () => {
  it('builds session and config paths', () => {
    const dir = tempDir();
    expect(sessionFilePath(dir, 'u1', 'c1')).toBe(path.join(dir, 'sessions', 'u1', 'c1.jsonl'));
    expect(userConfigDir(dir, 'u1')).toBe(path.join(dir, 'users', 'u1', 'config'));
  });
});

describe('writeUserAgentSettings', () => {
  it('writes defaultModel and pi-subagents package', () => {
    const dir = tempDir();
    const configDir = writeUserAgentSettings(dir, 'u1', { subagentModel: 'p1/m1' }, true);
    const document = JSON.parse(fs.readFileSync(path.join(configDir, 'settings.json'), 'utf8'));
    expect(document.subagents.defaultModel).toBe('p1/m1');
    expect(document.packages).toEqual(['npm:pi-subagents']);
  });

  it('omits pi-subagents packages when tools are disabled', () => {
    const dir = tempDir();
    const configDir = writeUserAgentSettings(dir, 'u1', { subagentModel: 'p1/m1' }, false);
    const document = JSON.parse(fs.readFileSync(path.join(configDir, 'settings.json'), 'utf8'));
    expect(document.subagents.defaultModel).toBe('p1/m1');
    expect(document.packages).toEqual([]);
  });

  it('removes stale pi-subagents packages when tools are disabled', () => {
    const dir = tempDir();
    writeUserAgentSettings(dir, 'u1', { subagentModel: 'p1/m1' }, true);
    const configDir = writeUserAgentSettings(dir, 'u1', {}, false);
    const document = JSON.parse(fs.readFileSync(path.join(configDir, 'settings.json'), 'utf8'));
    expect(document.packages).toEqual([]);
    expect(document.subagents.defaultModel).toBe('p1/m1');
  });

  it('preserves existing keys and dedupes packages', () => {
    const dir = tempDir();
    const configDir = userConfigDir(dir, 'u1');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, 'settings.json'),
      JSON.stringify({ auth: { token: 'x' }, packages: ['npm:other'] }),
    );
    writeUserAgentSettings(dir, 'u1', { subagentModel: 'p1/m2' }, true);
    const document = JSON.parse(fs.readFileSync(path.join(configDir, 'settings.json'), 'utf8'));
    expect(document.auth).toEqual({ token: 'x' });
    expect(document.subagents.defaultModel).toBe('p1/m2');
    expect(document.packages).toEqual(['npm:other', 'npm:pi-subagents']);
  });

  it('does not touch defaultModel when unspecified', () => {
    const dir = tempDir();
    writeUserAgentSettings(dir, 'u1', { subagentModel: 'p1/m1' });
    writeUserAgentSettings(dir, 'u1', {});
    const document = JSON.parse(
      fs.readFileSync(path.join(userConfigDir(dir, 'u1'), 'settings.json'), 'utf8'),
    );
    expect(document.subagents.defaultModel).toBe('p1/m1');
  });
});

describe('deleteSessionFile', () => {
  it('removes existing files and tolerates missing ones', () => {
    const dir = tempDir();
    expect(deleteSessionFile(dir, 'u1', 'missing')).toBe(true);
    const file = sessionFilePath(dir, 'u1', 'c1');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{}');
    expect(deleteSessionFile(dir, 'u1', 'c1')).toBe(true);
    expect(fs.existsSync(file)).toBe(false);
  });
});
