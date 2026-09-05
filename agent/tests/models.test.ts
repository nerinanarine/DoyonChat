import {
  filterModelsByScope,
  fullModelId,
  isModelAllowed,
  matchModelPattern,
  parseModelRef,
  parseScopeEnv,
} from '../src/models';

describe('matchModelPattern', () => {
  const deepseek = { id: 'deepseek-v4-flash', provider: 'opencode-go' };

  it('matches globs against provider/id when the pattern contains a slash', () => {
    expect(matchModelPattern('opencode-go/deepseek-*', deepseek)).toBe(true);
    expect(matchModelPattern('opencode-go/qwen*', deepseek)).toBe(false);
    expect(matchModelPattern('anthropic/*', deepseek)).toBe(false);
  });

  it('matches bare patterns against the model id only', () => {
    expect(matchModelPattern('deepseek-*', deepseek)).toBe(true);
    expect(matchModelPattern('*-flash', deepseek)).toBe(true);
    expect(matchModelPattern('opencode-go', deepseek)).toBe(false);
  });

  it('supports ? and escapes regex chars', () => {
    expect(matchModelPattern('deepseek-v4-flas?', deepseek)).toBe(true);
    expect(matchModelPattern('deepseek.v4.flash', { id: 'deepseek-v4-flash' })).toBe(false);
  });

  it('rejects blank patterns', () => {
    expect(matchModelPattern('  ', deepseek)).toBe(false);
  });
});

describe('filterModelsByScope', () => {
  const models = [
    { id: 'a', provider: 'p1' },
    { id: 'b', provider: 'p2' },
  ];

  it('allows everything on empty scope', () => {
    expect(filterModelsByScope(models, [])).toEqual(models);
    expect(filterModelsByScope(models, ['  '])).toEqual(models);
  });

  it('filters by any matching pattern', () => {
    expect(filterModelsByScope(models, ['p1/*'])).toEqual([{ id: 'a', provider: 'p1' }]);
    expect(filterModelsByScope(models, ['b'])).toEqual([{ id: 'b', provider: 'p2' }]);
    expect(filterModelsByScope(models, ['zzz'])).toEqual([]);
  });

  it('builds full ids', () => {
    expect(fullModelId({ id: 'a', provider: 'p1' })).toBe('p1/a');
    expect(fullModelId({ id: 'a' })).toBe('a');
  });
});

describe('parseModelRef / isModelAllowed / parseScopeEnv', () => {
  it('parses provider/id refs', () => {
    expect(parseModelRef('p1/a')).toEqual({ provider: 'p1', modelId: 'a' });
    expect(parseModelRef('bare')).toBeNull();
    expect(parseModelRef('/a')).toBeNull();
    expect(parseModelRef('p1/')).toBeNull();
    expect(parseModelRef(42)).toBeNull();
  });

  it('checks scope membership', () => {
    expect(isModelAllowed('p1', 'a', [])).toBe(true);
    expect(isModelAllowed('p1', 'a', ['p1/*'])).toBe(true);
    expect(isModelAllowed('p1', 'a', ['p2/*'])).toBe(false);
  });

  it('parses scope env', () => {
    expect(parseScopeEnv(undefined)).toEqual([]);
    expect(parseScopeEnv('p1/*, b ,')).toEqual(['p1/*', 'b']);
  });
});
