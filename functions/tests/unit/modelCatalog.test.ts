import {
  DEFAULT_MODEL_ID,
  MODEL_CATALOG,
  PUBLIC_MODELS,
  getModelConfig,
  getModelProtocol,
  hasModel,
} from '../../src/config/modelCatalog';
import { ModelInfo } from '../../src/types';

const EXPECTED_MODELS = [
  ['grok-4.7', 'responses'],
  ['gpt-6-luna', 'responses'],
  ['gpt-5.6-luna', 'responses'],
  ['claude-haiku-5-5', 'messages'],
  ['gemini-4-argon', 'google'],
  ['glm-5.3-flash', 'chat-completions'],
  ['glm-5.3', 'chat-completions'],
  ['glm-5.2', 'chat-completions'],
  ['kimi-k3.1-pro', 'chat-completions'],
  ['kimi-k3', 'chat-completions'],
  ['kimi-k2.7-code', 'chat-completions'],
  ['longcat-2.5-free', 'chat-completions'],
  ['longcat-2.0', 'chat-completions'],
  ['deepseek-v4.1-flash', 'chat-completions'],
  ['deepseek-v4-pro', 'chat-completions'],
  ['mimo-v2.6-flash', 'chat-completions'],
  ['mimo-v2.6-pro', 'chat-completions'],
  ['mimo-v2.5', 'chat-completions'],
  ['mimo-v2.5-pro', 'chat-completions'],
  ['minimax-m3.1-flash', 'chat-completions'],
  ['minimax-m3', 'messages'],
  ['muse-spark-1.3-contributor', 'responses'],
  ['muse-spark-1.2-contributor', 'responses'],
  ['qwen3.8-max', 'messages'],
  ['qwen3.8-flash', 'messages'],
  ['qwen3.7-plus', 'messages'],
  ['hy4', 'chat-completions'],
  ['hy4-preview', 'chat-completions'],
  ['hy3', 'chat-completions'],
  ['step-5-preview', 'chat-completions'],
  ['beam-free', 'chat-completions'],
  ['iceman-contributor-free', 'chat-completions'],
] as const;

const EXISTING_METADATA: Record<string, Omit<ModelInfo, 'id'>> = {
  'kimi-k2.7-code': { name: 'Kimi K2.7 Code', description: 'Advanced coding assistant', quality: 5, speed: 'Fast', cost: '★★☆', supportsMultimodal: false, contextLength: '256K', bestFor: 'Advanced coding' },
  'kimi-k3': { name: 'Kimi K3', description: 'High-end reasoning and coding', quality: 5, speed: 'Medium', cost: '★☆☆', supportsMultimodal: false, contextLength: '256K', bestFor: 'Advanced coding, reasoning' },
  'glm-5.2': { name: 'GLM-5.2', description: 'Latest GLM with image analysis', quality: 5, speed: 'Medium', cost: '★★☆', supportsMultimodal: true, contextLength: '~128K', bestFor: 'Quality, vision' },
  'gpt-5.6-luna': { name: 'GPT-5.6 Luna', description: 'General reasoning and coding', quality: 5, speed: 'Fast', cost: '★★★★☆', supportsMultimodal: false, contextLength: '272K', bestFor: 'General reasoning, coding' },
  'deepseek-v4-pro': { name: 'DeepSeek V4 Pro', description: 'Coding and agent workflows', quality: 5, speed: 'Medium', cost: '★☆☆', supportsMultimodal: false, contextLength: '1M', bestFor: 'Agents, coding' },
  'qwen3.8-max': { name: 'Qwen 3.8 Max', description: 'High-quality general model', quality: 5, speed: 'Medium', cost: '★☆☆', supportsMultimodal: false, contextLength: '~128K', bestFor: 'General quality' },
  'qwen3.7-plus': { name: 'Qwen 3.7 Plus', description: 'Enhanced general coding', quality: 4, speed: 'Fast', cost: '★★★★☆', supportsMultimodal: false, contextLength: '~128K', bestFor: 'General coding' },
  'minimax-m3': { name: 'MiniMax M3', description: 'General tasks with long context', quality: 4, speed: 'Medium', cost: '★★★★☆', supportsMultimodal: false, contextLength: '1M', bestFor: 'Long context, general tasks' },
  'mimo-v2.5-pro': { name: 'MiMo-V2.5 Pro', description: 'High-quality general model', quality: 4, speed: 'Medium', cost: '★★★★☆', supportsMultimodal: false, contextLength: '1M', bestFor: 'General quality' },
  'mimo-v2.5': { name: 'MiMo-V2.5', description: 'Fast and efficient general model', quality: 3, speed: 'Fast', cost: '★★★★★', supportsMultimodal: false, contextLength: '1M', bestFor: 'Fast tasks, high volume' },
  hy3: { name: 'Hy3', description: 'Experimental model', quality: 3, speed: 'Medium', cost: '★★★★☆', supportsMultimodal: false, contextLength: '~128K', bestFor: 'Experimental tasks' },
};

describe('OpenCode Go model catalog contract', () => {
  it('contains the canonical 32 models in fixed protocol order', () => {
    expect(MODEL_CATALOG.map(({ info, protocol }) => [info.id, protocol])).toEqual(EXPECTED_MODELS);
    expect(new Set(MODEL_CATALOG.map(({ info }) => info.id)).size).toBe(32);
  });

  it('contains 5 Responses, 21 Chat Completions, 5 Messages, and 1 Google model', () => {
    const counts = MODEL_CATALOG.reduce<Record<string, number>>((result, model) => {
      result[model.protocol] = (result[model.protocol] ?? 0) + 1;
      return result;
    }, {});

    expect(counts).toEqual({
      responses: 5,
      'chat-completions': 21,
      messages: 5,
      google: 1,
    });
  });

  it('keeps the public metadata of the existing 11 models', () => {
    expect(Object.keys(EXISTING_METADATA)).toHaveLength(11);
    for (const [id, metadata] of Object.entries(EXISTING_METADATA)) {
      expect(getModelConfig(id)?.info).toEqual({ id, ...metadata });
    }
  });

  it('uses neutral metadata matching the 1.2 description for muse-spark-1.3-contributor', () => {
    expect(getModelConfig('muse-spark-1.3-contributor')?.info).toEqual({
      id: 'muse-spark-1.3-contributor',
      name: 'Muse Spark 1.3 Contributor',
      description: 'OpenCode Go model. Regional restrictions apply; prompts and outputs may be used for training.',
      quality: 3,
      speed: 'Unknown',
      cost: 'See OpenCode Go',
      supportsMultimodal: false,
      contextLength: 'Unknown',
      bestFor: 'General use',
    });
  });

  it('uses neutral metadata for the earlier neutral models', () => {
    expect([
      getModelConfig('muse-spark-1.2-contributor')?.info,
      getModelConfig('glm-5.3')?.info,
      getModelConfig('glm-5.3-flash')?.info,
    ]).toEqual([
      { id: 'muse-spark-1.2-contributor', name: 'Muse Spark 1.2 Contributor', description: 'OpenCode Go model. Regional restrictions apply; prompts and outputs may be used for training.', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
      { id: 'glm-5.3', name: 'GLM-5.3', description: 'OpenCode Go model', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
      { id: 'glm-5.3-flash', name: 'GLM-5.3-Flash', description: 'OpenCode Go model', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
    ]);
  });

  it('uses neutral metadata for the models added in the previous refresh', () => {
    expect([
      getModelConfig('grok-4.7')?.info,
      getModelConfig('gpt-6-luna')?.info,
      getModelConfig('longcat-2.0')?.info,
      getModelConfig('qwen3.8-flash')?.info,
      getModelConfig('hy4-preview')?.info,
      getModelConfig('deepseek-v4.1-flash')?.info,
      getModelConfig('mimo-v2.6-flash')?.info,
      getModelConfig('mimo-v2.6-pro')?.info,
    ]).toEqual([
      { id: 'grok-4.7', name: 'Grok 4.7', description: 'OpenCode Go model', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
      { id: 'gpt-6-luna', name: 'GPT-6 Luna', description: 'OpenCode Go model', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
      { id: 'longcat-2.0', name: 'LongCat-2.0', description: 'OpenCode Go model', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
      { id: 'qwen3.8-flash', name: 'Qwen3.8 Flash', description: 'OpenCode Go model', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
      { id: 'hy4-preview', name: 'Hy4 preview', description: 'OpenCode Go model', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
      { id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash', description: 'OpenCode Go model', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
      { id: 'mimo-v2.6-flash', name: 'MiMo-V2.6 Flash', description: 'OpenCode Go model', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
      { id: 'mimo-v2.6-pro', name: 'MiMo-V2.6 Pro', description: 'OpenCode Go model', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
    ]);

    expect(getModelConfig('deepseek-v4.1-flash')?.maxTokens).toBe(16384);
  });

  it('uses neutral metadata for the models added in the latest refresh', () => {
    expect([
      getModelConfig('claude-haiku-5-5')?.info,
      getModelConfig('gemini-4-argon')?.info,
      getModelConfig('kimi-k3.1-pro')?.info,
      getModelConfig('minimax-m3.1-flash')?.info,
      getModelConfig('hy4')?.info,
      getModelConfig('step-5-preview')?.info,
      getModelConfig('beam-free')?.info,
      getModelConfig('iceman-contributor-free')?.info,
      getModelConfig('longcat-2.5-free')?.info,
    ]).toEqual([
      { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', description: 'OpenCode Go model', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
      { id: 'gemini-4-argon', name: 'Gemini 4 Argon', description: 'OpenCode Go model', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
      { id: 'kimi-k3.1-pro', name: 'Kimi K3.1 Pro', description: 'OpenCode Go model', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
      { id: 'minimax-m3.1-flash', name: 'MiniMax M3.1 Flash', description: 'OpenCode Go model', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
      { id: 'hy4', name: 'Hy4', description: 'OpenCode Go model', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
      { id: 'step-5-preview', name: 'Step 5 Preview', description: 'OpenCode Go model', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
      { id: 'beam-free', name: 'Beam Free', description: 'OpenCode Go model', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
      { id: 'iceman-contributor-free', name: 'Iceman Contributor Free', description: 'OpenCode Go model', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
      { id: 'longcat-2.5-free', name: 'LongCat 2.5 Free', description: 'OpenCode Go model', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
    ]);
  });

  it('exposes public models without internal protocol metadata', () => {
    expect(PUBLIC_MODELS).toEqual(MODEL_CATALOG.map(({ info }) => info));
    expect(PUBLIC_MODELS.every((model) => !('protocol' in model))).toBe(true);
  });

  it('provides the default and lookup helpers without accepting excluded models', () => {
    expect(DEFAULT_MODEL_ID).toBe('kimi-k3');
    expect(hasModel(DEFAULT_MODEL_ID)).toBe(true);
    expect(getModelProtocol('grok-4.7')).toBe('responses');
    expect(getModelProtocol('glm-5.2')).toBe('chat-completions');
    expect(getModelProtocol('minimax-m3')).toBe('messages');
    expect(getModelProtocol('gemini-4-argon')).toBe('google');

    for (const id of ['kimi-k2.6', 'grok-4.6', 'minimax-m2.7']) {
      expect(hasModel(id)).toBe(false);
      expect(getModelConfig(id)).toBeUndefined();
      expect(getModelProtocol(id)).toBeUndefined();
    }
  });
});
