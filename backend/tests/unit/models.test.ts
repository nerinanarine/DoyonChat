import { models } from '../../src/routes/models';

describe('Model Definitions', () => {
  const officialModelIds = [
    'grok-4.5',
    'gpt-5.6-luna',
    'glm-5.2',
    'glm-5.1',
    'kimi-k3',
    'kimi-k2.7-code',
    'kimi-k2.6',
    'mimo-v2.5',
    'mimo-v2.5-pro',
    'minimax-m3',
    'minimax-m2.7',
    'qwen3.8-max',
    'qwen3.7-max',
    'qwen3.7-plus',
    'qwen3.6-plus',
    'deepseek-v4-pro',
    'deepseek-v4-flash',
    'hy3',
  ];

  it('contains the current OpenCode Go model catalog', () => {
    expect(models).toHaveLength(officialModelIds.length);
    expect(models.map((model) => model.id).sort()).toEqual([...officialModelIds].sort());
    expect(models.filter((model) => model.supportsMultimodal).map((model) => model.id)).toEqual([
      'glm-5.2',
      'glm-5.1',
    ]);
  });
});
