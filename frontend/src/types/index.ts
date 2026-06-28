export interface Conversation {
  id: string;
  title: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  quality: number;
  speed: string;
  cost: string;
  supportsMultimodal: boolean;
  contextLength: string;
  bestFor: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
  createdAt: string;
}

export interface ChatRequest {
  conversationId: string;
  message: string;
  imageBase64?: string;
}
