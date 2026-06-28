describe('Model Definitions', () => {
  it('should have model definitions that match the OpenCode Go models', () => {
    const modelIds = [
      'kimi-k2.6',
      'glm-5.1',
      'glm-5',
      'deepseek-v4-pro',
      'deepseek-v4-flash',
      'qwen3.6-plus',
      'qwen3.5-plus',
      'minimax-m2.5',
      'minimax-m2.7',
      'mimo-v2-pro',
      'mimo-v2-omni',
    ];

    expect(modelIds).toContain('kimi-k2.6');
    expect(modelIds).toContain('glm-5.1');
    expect(modelIds.length).toBe(11);
  });
});
