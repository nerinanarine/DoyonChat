import { Router } from 'express';
import { ModelInfo } from '../types';

const router = Router();

// OpenCode Go model catalog (official list checked 2026-08-02).
export const models: ModelInfo[] = [
  { id: 'kimi-k2.6', name: 'Kimi K2.6', description: 'Complex coding, general tasks', quality: 5, speed: 'Fast', cost: '★★☆', supportsMultimodal: false, contextLength: '256K', bestFor: 'Coding, reasoning' },
  { id: 'kimi-k2.7-code', name: 'Kimi K2.7 Code', description: 'Advanced coding assistant', quality: 5, speed: 'Fast', cost: '★★☆', supportsMultimodal: false, contextLength: '256K', bestFor: 'Advanced coding' },
  { id: 'kimi-k3', name: 'Kimi K3', description: 'High-end reasoning and coding', quality: 5, speed: 'Medium', cost: '★☆☆', supportsMultimodal: false, contextLength: '256K', bestFor: 'Advanced coding, reasoning' },
  { id: 'glm-5.2', name: 'GLM-5.2', description: 'Latest GLM with image analysis', quality: 5, speed: 'Medium', cost: '★★☆', supportsMultimodal: true, contextLength: '~128K', bestFor: 'Quality, vision' },
  { id: 'glm-5.1', name: 'GLM-5.1', description: 'High-quality reasoning and image analysis', quality: 5, speed: 'Medium', cost: '★★☆', supportsMultimodal: true, contextLength: '~128K', bestFor: 'Quality, vision' },
  { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', description: 'General reasoning and coding', quality: 5, speed: 'Fast', cost: '★★★★☆', supportsMultimodal: false, contextLength: '272K', bestFor: 'General reasoning, coding' },
  { id: 'grok-4.5', name: 'Grok 4.5', description: 'Frontier general reasoning model', quality: 5, speed: 'Medium', cost: '★☆☆', supportsMultimodal: false, contextLength: '256K', bestFor: 'Reasoning, general tasks' },
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', description: 'Coding and agent workflows', quality: 5, speed: 'Medium', cost: '★☆☆', supportsMultimodal: false, contextLength: '1M', bestFor: 'Agents, coding' },
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', description: 'Fast coding and background tasks', quality: 4, speed: 'Fast', cost: '★★★★★', supportsMultimodal: false, contextLength: '1M', bestFor: 'Fast tasks, high volume' },
  { id: 'qwen3.8-max', name: 'Qwen 3.8 Max', description: 'High-quality general model', quality: 5, speed: 'Medium', cost: '★☆☆', supportsMultimodal: false, contextLength: '~128K', bestFor: 'General quality' },
  { id: 'qwen3.7-max', name: 'Qwen 3.7 Max', description: 'High-quality Qwen model', quality: 4, speed: 'Medium', cost: '★☆☆', supportsMultimodal: false, contextLength: '~128K', bestFor: 'General quality' },
  { id: 'qwen3.7-plus', name: 'Qwen 3.7 Plus', description: 'Enhanced general coding', quality: 4, speed: 'Fast', cost: '★★★★☆', supportsMultimodal: false, contextLength: '~128K', bestFor: 'General coding' },
  { id: 'qwen3.6-plus', name: 'Qwen 3.6 Plus', description: 'General coding', quality: 3, speed: 'Fast', cost: '★★★★☆', supportsMultimodal: false, contextLength: '~128K', bestFor: 'General tasks' },
  { id: 'minimax-m3', name: 'MiniMax M3', description: 'General tasks with long context', quality: 4, speed: 'Medium', cost: '★★★★☆', supportsMultimodal: false, contextLength: '1M', bestFor: 'Long context, general tasks' },
  { id: 'minimax-m2.7', name: 'MiniMax M2.7', description: 'Balanced quality and cost', quality: 3, speed: 'Medium', cost: '★★★★☆', supportsMultimodal: false, contextLength: '~128K', bestFor: 'Balanced tasks' },
  { id: 'mimo-v2.5-pro', name: 'MiMo-V2.5 Pro', description: 'High-quality general model', quality: 4, speed: 'Medium', cost: '★★★★☆', supportsMultimodal: false, contextLength: '1M', bestFor: 'General quality' },
  { id: 'mimo-v2.5', name: 'MiMo-V2.5', description: 'Fast and efficient general model', quality: 3, speed: 'Fast', cost: '★★★★★', supportsMultimodal: false, contextLength: '1M', bestFor: 'Fast tasks, high volume' },
  { id: 'hy3', name: 'Hy3', description: 'Experimental model', quality: 3, speed: 'Medium', cost: '★★★★☆', supportsMultimodal: false, contextLength: '~128K', bestFor: 'Experimental tasks' },
];

router.get('/', (_req, res) => {
  res.json(models);
});

export default router;
