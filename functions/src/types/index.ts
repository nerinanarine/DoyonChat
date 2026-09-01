export interface Conversation {
  id: string;
  userId?: string;
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
  reasoning?: string;
  imageUrl?: string;
  model?: string;
  createdAt: string;
}

export interface ChatRequest {
  conversationId: string;
  message: string;
  imageBase64?: string;
}

export interface UserSettings {
  defaultModel?: string;
  displayName?: string;
}

export interface UserSettingsDocument {
  id: string;
  userId: string;
  settings: UserSettings;
  updatedAt: string;
}

export interface UserSettingsResponse {
  userId: string;
  settings: UserSettings;
  updatedAt?: string;
}

export interface OpenCodeGoMessage {
  role: 'user' | 'assistant';
  content: string | OpenCodeGoContentPart[];
}

export interface OpenCodeGoContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}
