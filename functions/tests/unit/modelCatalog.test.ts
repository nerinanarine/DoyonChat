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
  ['grok-4.6', 'responses'],
  ['gpt-5.6-luna', 'responses'],
  ['glm-5.3-flash', 'chat-completions'],
  ['glm-5.3', 'chat-completions'],
  ['glm-5.2', 'chat-completions'],
  ['glm-5.1', 'chat-completions'],
  ['kimi-k3', 'chat-completions'],
  ['kimi-k2.7-code', 'chat-completions'],
  ['kimi-k2.6', 'chat-completions'],
  ['longcat-2.0', 'chat-completions'],
  ['deepseek-v4-pro', 'chat-completions'],
  ['deepseek-v4-flash', 'chat-completions'],
  ['deepseek-v4-flash-vision-exp', 'chat-completions'],
  ['mimo-v2.5', 'chat-completions'],
  ['mimo-v2.5-pro', 'chat-completions'],
  ['minimax-m3', 'messages'],
  ['minimax-m2.7', 'messages'],
  ['minimax-m2.5', 'messages'],
  ['muse-spark-1.2-contributor', 'responses'],
  ['qwen3.8-max', 'messages'],
  ['qwen3.8-flash', 'messages'],
  ['qwen3.7-max', 'messages'],
  ['qwen3.7-plus', 'messages'],
  ['qwen3.6-plus', 'messages'],
  ['hy4-preview', 'chat-completions'],
  ['hy3', 'chat-completions'],
] as const;

const EXISTING_METADATA: Record<string, Omit<ModelInfo, 'id'>> = {
  'kimi-k2.6': { name: 'Kimi K2.6', description: 'Complex coding, general tasks', quality: 5, speed: 'Fast', cost: '★★☆', supportsMultimodal: false, contextLength: '256K', bestFor: 'Coding, reasoning' },
  'kimi-k2.7-code': { name: 'Kimi K2.7 Code', description: 'Advanced coding assistant', quality: 5, speed: 'Fast', cost: '★★☆', supportsMultimodal: false, contextLength: '256K', bestFor: 'Advanced coding' },
  'kimi-k3': { name: 'Kimi K3', description: 'High-end reasoning and coding', quality: 5, speed: 'Medium', cost: '★☆☆', supportsMultimodal: false, contextLength: '256K', bestFor: 'Advanced coding, reasoning' },
  'glm-5.2': { name: 'GLM-5.2', description: 'Latest GLM with image analysis', quality: 5, speed: 'Medium', cost: '★★☆', supportsMultimodal: true, contextLength: '~128K', bestFor: 'Quality, vision' },
  'glm-5.1': { name: 'GLM-5.1', description: 'High-quality reasoning and image analysis', quality: 5, speed: 'Medium', cost: '★★☆', supportsMultimodal: true, contextLength: '~128K', bestFor: 'Quality, vision' },
  'gpt-5.6-luna': { name: 'GPT-5.6 Luna', description: 'General reasoning and coding', quality: 5, speed: 'Fast', cost: '★★★★☆', supportsMultimodal: false, contextLength: '272K', bestFor: 'General reasoning, coding' },
  'deepseek-v4-pro': { name: 'DeepSeek V4 Pro', description: 'Coding and agent workflows', quality: 5, speed: 'Medium', cost: '★☆☆', supportsMultimodal: false, contextLength: '1M', bestFor: 'Agents, coding' },
  'deepseek-v4-flash': { name: 'DeepSeek V4 Flash', description: 'Fast coding and background tasks', quality: 4, speed: 'Fast', cost: '★★★★★', supportsMultimodal: false, contextLength: '1M', bestFor: 'Fast tasks, high volume' },
  'qwen3.8-max': { name: 'Qwen 3.8 Max', description: 'High-quality general model', quality: 5, speed: 'Medium', cost: '★☆☆', supportsMultimodal: false, contextLength: '~128K', bestFor: 'General quality' },
  'qwen3.7-max': { name: 'Qwen 3.7 Max', description: 'High-quality Qwen model', quality: 4, speed: 'Medium', cost: '★☆☆', supportsMultimodal: false, contextLength: '~128K', bestFor: 'General quality' },
  'qwen3.7-plus': { name: 'Qwen 3.7 Plus', description: 'Enhanced general coding', quality: 4, speed: 'Fast', cost: '★★★★☆', supportsMultimodal: false, contextLength: '~128K', bestFor: 'General coding' },
  'qwen3.6-plus': { name: 'Qwen 3.6 Plus', description: 'General coding', quality: 3, speed: 'Fast', cost: '★★★★☆', supportsMultimodal: false, contextLength: '~128K', bestFor: 'General tasks' },
  'minimax-m3': { name: 'MiniMax M3', description: 'General tasks with long context', quality: 4, speed: 'Medium', cost: '★★★★☆', supportsMultimodal: false, contextLength: '1M', bestFor: 'Long context, general tasks' },
  'minimax-m2.7': { name: 'MiniMax M2.7', description: 'Balanced quality and cost', quality: 3, speed: 'Medium', cost: '★★★★☆', supportsMultimodal: false, contextLength: '~128K', bestFor: 'Balanced tasks' },
  'mimo-v2.5-pro': { name: 'MiMo-V2.5 Pro', description: 'High-quality general model', quality: 4, speed: 'Medium', cost: '★★★★☆', supportsMultimodal: false, contextLength: '1M', bestFor: 'General quality' },
  'mimo-v2.5': { name: 'MiMo-V2.5', description: 'Fast and efficient general model', quality: 3, speed: 'Fast', cost: '★★★★★', supportsMultimodal: false, contextLength: '1M', bestFor: 'Fast tasks, high volume' },
  hy3: { name: 'Hy3', description: 'Experimental model', quality: 3, speed: 'Medium', cost: '★★★★☆', supportsMultimodal: false, contextLength: '~128K', bestFor: 'Experimental tasks' },
};

describe('OpenCode Go model catalog contract', () => {
  it('contains the canonical 26 models in fixed protocol order', () => {
    expect(MODEL_CATALOG.map(({ info, protocol }) => [info.id, protocol])).toEqual(EXPECTED_MODELS);
    expect(new Set(MODEL_CATALOG.map(({ info }) => info.id)).size).toBe(26);
  });

  it('contains 3 Responses, 15 Chat Completions, and 8 Messages models', () => {
    const counts = MODEL_CATALOG.reduce<Record<string, number>>((result, model) => {
      result[model.protocol] = (result[model.protocol] ?? 0) + 1;
      return result;
    }, {});

    expect(counts).toEqual({ responses: 3, 'chat-completions': 15, messages: 8 });
  });

  it('keeps the public metadata of the existing 17 models', () => {
    expect(Object.keys(EXISTING_METADATA)).toHaveLength(17);
    for (const [id, metadata] of Object.entries(EXISTING_METADATA)) {
      expect(getModelConfig(id)?.info).toEqual({ id, ...metadata });
    }
  });

  it('uses neutral metadata for the earlier neutral models', () => {
    expect([
      getModelConfig('muse-spark-1.2-contributor')?.info,
      getModelConfig('glm-5.3')?.info,
      getModelConfig('deepseek-v4-flash-vision-exp')?.info,
      getModelConfig('minimax-m2.5')?.info,
    ]).toEqual([
      { id: 'muse-spark-1.2-contributor', name: 'Muse Spark 1.2 Contributor', description: 'OpenCode Go model. Regional restrictions apply; prompts and outputs may be used for training.', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
      { id: 'glm-5.3', name: 'GLM-5.3', description: 'OpenCode Go model', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
      { id: 'deepseek-v4-flash-vision-exp', name: 'DeepSeek V4 Flash Vision Exp', description: 'OpenCode Go model', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: true, contextLength: 'Unknown', bestFor: 'General use' },
      { id: 'minimax-m2.5', name: 'MiniMax M2.5', description: 'OpenCode Go model', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
    ]);
  });

  it('uses neutral metadata for the five models added in the catalog refresh', () => {
    expect([
      getModelConfig('grok-4.6')?.info,
      getModelConfig('glm-5.3-flash')?.info,
      getModelConfig('longcat-2.0')?.info,
      getModelConfig('qwen3.8-flash')?.info,
      getModelConfig('hy4-preview')?.info,
    ]).toEqual([
      { id: 'grok-4.6', name: 'Grok 4.6', description: 'OpenCode Go model', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
      { id: 'glm-5.3-flash', name: 'GLM-5.3-Flash', description: 'OpenCode Go model', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
      { id: 'longcat-2.0', name: 'LongCat-2.0', description: 'OpenCode Go model', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
      { id: 'qwen3.8-flash', name: 'Qwen3.8 Flash', description: 'OpenCode Go model', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
      { id: 'hy4-preview', name: 'Hy4 preview', description: 'OpenCode Go model', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
    ]);
  });

  it('exposes public models without internal protocol metadata', () => {
    expect(PUBLIC_MODELS).toEqual(MODEL_CATALOG.map(({ info }) => info));
    expect(PUBLIC_MODELS.every((model) => !('protocol' in model))).toBe(true);
  });

  it('provides the default and lookup helpers without accepting excluded models', () => {
    expect(DEFAULT_MODEL_ID).toBe('kimi-k2.6');
    expect(hasModel(DEFAULT_MODEL_ID)).toBe(true);
    expect(getModelProtocol('grok-4.6')).toBe('responses');
    expect(getModelProtocol('glm-5.2')).toBe('chat-completions');
    expect(getModelProtocol('minimax-m3')).toBe('messages');

    for (const id of ['kimi-k2.5', 'glm-5', 'qwen3.5-plus', 'mimo-v2-pro', 'mimo-v2-omni', 'hy3-preview', 'grok-4.5', 'ox-alpha-free']) {
      expect(hasModel(id)).toBe(false);
      expect(getModelConfig(id)).toBeUndefined();
      expect(getModelProtocol(id)).toBeUndefined();
    }
  });
});