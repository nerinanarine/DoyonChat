import { ModelInfo } from '../types';

export type OpenCodeGoProtocol = 'responses' | 'chat-completions' | 'messages';

export interface OpenCodeGoModelConfig {
  info: ModelInfo;
  protocol: OpenCodeGoProtocol;
  /** このモデルの既定 max_tokens / max_output_tokens。未指定なら 4096。 */
  maxTokens?: number;
}

export const MODEL_CATALOG: OpenCodeGoModelConfig[] = [
  {
    info: { id: 'grok-4.6', name: 'Grok 4.6', description: 'OpenCode Go model', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
    protocol: 'responses',
  },
  {
    info: { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', description: 'General reasoning and coding', quality: 5, speed: 'Fast', cost: '★★★★☆', supportsMultimodal: false, contextLength: '272K', bestFor: 'General reasoning, coding' },
    protocol: 'responses',
  },
  {
    info: { id: 'glm-5.3-flash', name: 'GLM-5.3-Flash', description: 'OpenCode Go model', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
    protocol: 'chat-completions',
  },
  {
    info: { id: 'glm-5.3', name: 'GLM-5.3', description: 'OpenCode Go model', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
    protocol: 'chat-completions',
  },
  {
    info: { id: 'glm-5.2', name: 'GLM-5.2', description: 'Latest GLM with image analysis', quality: 5, speed: 'Medium', cost: '★★☆', supportsMultimodal: true, contextLength: '~128K', bestFor: 'Quality, vision' },
    protocol: 'chat-completions',
  },
  {
    info: { id: 'glm-5.1', name: 'GLM-5.1', description: 'High-quality reasoning and image analysis', quality: 5, speed: 'Medium', cost: '★★☆', supportsMultimodal: true, contextLength: '~128K', bestFor: 'Quality, vision' },
    protocol: 'chat-completions',
  },
  {
    info: { id: 'kimi-k3', name: 'Kimi K3', description: 'High-end reasoning and coding', quality: 5, speed: 'Medium', cost: '★☆☆', supportsMultimodal: false, contextLength: '256K', bestFor: 'Advanced coding, reasoning' },
    protocol: 'chat-completions',
  },
  {
    info: { id: 'kimi-k2.7-code', name: 'Kimi K2.7 Code', description: 'Advanced coding assistant', quality: 5, speed: 'Fast', cost: '★★☆', supportsMultimodal: false, contextLength: '256K', bestFor: 'Advanced coding' },
    protocol: 'chat-completions',
  },
  {
    info: { id: 'kimi-k2.6', name: 'Kimi K2.6', description: 'Complex coding, general tasks', quality: 5, speed: 'Fast', cost: '★★☆', supportsMultimodal: false, contextLength: '256K', bestFor: 'Coding, reasoning' },
    protocol: 'chat-completions',
  },
  {
    info: { id: 'longcat-2.0', name: 'LongCat-2.0', description: 'OpenCode Go model', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
    protocol: 'chat-completions',
  },
  {
    info: { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', description: 'Coding and agent workflows', quality: 5, speed: 'Medium', cost: '★☆☆', supportsMultimodal: false, contextLength: '1M', bestFor: 'Agents, coding' },
    protocol: 'chat-completions',
    maxTokens: 16384,
  },
  {
    info: { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', description: 'Fast coding and background tasks', quality: 4, speed: 'Fast', cost: '★★★★★', supportsMultimodal: false, contextLength: '1M', bestFor: 'Fast tasks, high volume' },
    protocol: 'chat-completions',
    maxTokens: 16384,
  },
  {
    info: { id: 'deepseek-v4-flash-vision-exp', name: 'DeepSeek V4 Flash Vision Exp', description: 'OpenCode Go model', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: true, contextLength: 'Unknown', bestFor: 'General use' },
    protocol: 'chat-completions',
    maxTokens: 16384,
  },
  {
    info: { id: 'mimo-v2.5', name: 'MiMo-V2.5', description: 'Fast and efficient general model', quality: 3, speed: 'Fast', cost: '★★★★★', supportsMultimodal: false, contextLength: '1M', bestFor: 'Fast tasks, high volume' },
    protocol: 'chat-completions',
  },
  {
    info: { id: 'mimo-v2.5-pro', name: 'MiMo-V2.5 Pro', description: 'High-quality general model', quality: 4, speed: 'Medium', cost: '★★★★☆', supportsMultimodal: false, contextLength: '1M', bestFor: 'General quality' },
    protocol: 'chat-completions',
  },
  {
    info: { id: 'minimax-m3', name: 'MiniMax M3', description: 'General tasks with long context', quality: 4, speed: 'Medium', cost: '★★★★☆', supportsMultimodal: false, contextLength: '1M', bestFor: 'Long context, general tasks' },
    protocol: 'messages',
  },
  {
    info: { id: 'minimax-m2.7', name: 'MiniMax M2.7', description: 'Balanced quality and cost', quality: 3, speed: 'Medium', cost: '★★★★☆', supportsMultimodal: false, contextLength: '~128K', bestFor: 'Balanced tasks' },
    protocol: 'messages',
  },
  {
    info: { id: 'minimax-m2.5', name: 'MiniMax M2.5', description: 'OpenCode Go model', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
    protocol: 'messages',
  },
  {
    info: { id: 'muse-spark-1.3-contributor', name: 'Muse Spark 1.3 Contributor', description: 'OpenCode Go model. Regional restrictions apply; prompts and outputs may be used for training.', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
    protocol: 'responses',
  },
  {
    info: { id: 'muse-spark-1.2-contributor', name: 'Muse Spark 1.2 Contributor', description: 'OpenCode Go model. Regional restrictions apply; prompts and outputs may be used for training.', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
    protocol: 'responses',
  },
  {
    info: { id: 'qwen3.8-max', name: 'Qwen 3.8 Max', description: 'High-quality general model', quality: 5, speed: 'Medium', cost: '★☆☆', supportsMultimodal: false, contextLength: '~128K', bestFor: 'General quality' },
    protocol: 'messages',
  },
  {
    info: { id: 'qwen3.8-flash', name: 'Qwen3.8 Flash', description: 'OpenCode Go model', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
    protocol: 'messages',
  },
  {
    info: { id: 'qwen3.7-max', name: 'Qwen 3.7 Max', description: 'High-quality Qwen model', quality: 4, speed: 'Medium', cost: '★☆☆', supportsMultimodal: false, contextLength: '~128K', bestFor: 'General quality' },
    protocol: 'messages',
  },
  {
    info: { id: 'qwen3.7-plus', name: 'Qwen 3.7 Plus', description: 'Enhanced general coding', quality: 4, speed: 'Fast', cost: '★★★★☆', supportsMultimodal: false, contextLength: '~128K', bestFor: 'General coding' },
    protocol: 'messages',
  },
  {
    info: { id: 'qwen3.6-plus', name: 'Qwen 3.6 Plus', description: 'General coding', quality: 3, speed: 'Fast', cost: '★★★★☆', supportsMultimodal: false, contextLength: '~128K', bestFor: 'General tasks' },
    protocol: 'messages',
  },
  {
    info: { id: 'hy4-preview', name: 'Hy4 preview', description: 'OpenCode Go model', quality: 3, speed: 'Unknown', cost: 'See OpenCode Go', supportsMultimodal: false, contextLength: 'Unknown', bestFor: 'General use' },
    protocol: 'chat-completions',
  },
  {
    info: { id: 'hy3', name: 'Hy3', description: 'Experimental model', quality: 3, speed: 'Medium', cost: '★★★★☆', supportsMultimodal: false, contextLength: '~128K', bestFor: 'Experimental tasks' },
    protocol: 'chat-completions',
  },
];

export const PUBLIC_MODELS: ModelInfo[] = MODEL_CATALOG.map(({ info }) => info);

export const DEFAULT_MODEL_ID = 'kimi-k2.6';

const MODEL_CONFIG_BY_ID = new Map(MODEL_CATALOG.map((config) => [config.info.id, config]));

export function hasModel(id: unknown): id is string {
  return typeof id === 'string' && MODEL_CONFIG_BY_ID.has(id);
}

export function getModelConfig(id: string): OpenCodeGoModelConfig | undefined {
  return MODEL_CONFIG_BY_ID.get(id);
}

export function getModelProtocol(id: string): OpenCodeGoProtocol | undefined {
  return getModelConfig(id)?.protocol;
}
