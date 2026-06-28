import { Router } from 'express';
import { ModelInfo } from '../types';

const router = Router();

const models: ModelInfo[] = [
  { id: 'kimi-k2.6', name: 'Kimi K2.6', description: 'Complex coding, general tasks', quality: 5, speed: 'Fast', cost: '★★☆', supportsMultimodal: false, contextLength: '256K', bestFor: 'Coding, reasoning' },
  { id: 'kimi-k2.7-code', name: 'Kimi K2.7 Code', description: 'Advanced coding assistant', quality: 5, speed: 'Fast', cost: '★★☆', supportsMultimodal: false, contextLength: '256K', bestFor: 'Advanced coding' },
  { id: 'kimi-k2.5', name: 'Kimi K2.5', description: 'Balanced performance', quality: 4, speed: 'Fast', cost: '★★☆', supportsMultimodal: false, contextLength: '256K', bestFor: 'Balanced tasks' },
  { id: 'glm-5.2', name: 'GLM-5.2', description: 'Latest GLM with image analysis', quality: 5, speed: 'Medium', cost: '★☆☆', supportsMultimodal: true, contextLength: '~128K', bestFor: 'Quality, vision' },
  { id: 'glm-5.1', name: 'GLM-5.1', description: 'Best quality, image analysis', quality: 5, speed: 'Medium', cost: '★☆☆', supportsMultimodal: true, contextLength: '~128K', bestFor: 'Quality, vision' },
  { id: 'glm-5', name: 'GLM-5', description: 'Reasoning, planning', quality: 4, speed: 'Medium', cost: '★☆☆', supportsMultimodal: false, contextLength: '~128K', bestFor: 'Reasoning' },
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', description: 'Coding, agent workflows', quality: 5, speed: 'Medium', cost: '★☆☆', supportsMultimodal: false, contextLength: '1M', bestFor: 'Agents, coding' },
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', description: 'Fast coding, background tasks', quality: 4, speed: 'Fast', cost: '★★☆', supportsMultimodal: false, contextLength: '1M', bestFor: 'Fast tasks' },
  { id: 'qwen3.7-max', name: 'Qwen 3.7 Max', description: 'Best Qwen model', quality: 4, speed: 'Medium', cost: '★★☆', supportsMultimodal: false, contextLength: '~128K', bestFor: 'General quality' },
  { id: 'qwen3.7-plus', name: 'Qwen 3.7 Plus', description: 'Enhanced general coding', quality: 4, speed: 'Fast', cost: '★★☆', supportsMultimodal: false, contextLength: '~128K', bestFor: 'General coding' },
  { id: 'qwen3.6-plus', name: 'Qwen 3.6 Plus', description: 'General coding', quality: 3, speed: 'Fast', cost: '★★★☆', supportsMultimodal: false, contextLength: '~128K', bestFor: 'General' },
  { id: 'qwen3.5-plus', name: 'Qwen 3.5 Plus', description: 'Simple tasks, bulk operations', quality: 2, speed: 'Very Fast', cost: '★★★★★', supportsMultimodal: false, contextLength: '~128K', bestFor: 'Bulk ops' },
  { id: 'minimax-m3', name: 'MiniMax M3', description: 'Latest MiniMax model', quality: 3, speed: 'Medium', cost: '★★★☆', supportsMultimodal: false, contextLength: '1M', bestFor: 'Long context' },
  { id: 'minimax-m2.7', name: 'MiniMax M2.7', description: 'Balanced quality/cost', quality: 3, speed: 'Medium', cost: '★★★☆', supportsMultimodal: false, contextLength: '~128K', bestFor: 'Balanced' },
  { id: 'minimax-m2.5', name: 'MiniMax M2.5', description: 'Long context on budget', quality: 2, speed: 'Fast', cost: '★★★★☆', supportsMultimodal: false, contextLength: '1M', bestFor: 'Budget long context' },
  { id: 'mimo-v2.5-pro', name: 'MiMo-V2.5 Pro', description: 'High quality general', quality: 4, speed: 'Medium', cost: '★★☆', supportsMultimodal: false, contextLength: '~128K', bestFor: 'General quality' },
  { id: 'mimo-v2.5', name: 'MiMo-V2.5', description: 'Balanced performance', quality: 3, speed: 'Medium', cost: '★★★☆', supportsMultimodal: false, contextLength: '~128K', bestFor: 'Balanced' },
  { id: 'hy3-preview', name: 'Hy3 Preview', description: 'Experimental model', quality: 3, speed: 'Medium', cost: '★★★☆', supportsMultimodal: false, contextLength: '~128K', bestFor: 'Experimental' },
];

router.get('/', (_req, res) => {
  res.json(models);
});

export default router;
