export interface Conversation {
  id: string;
  userId?: string;
  title: string;
  model: string;
  /** エージェントモード（P3-010）。未定義=false。 */
  agentMode?: boolean;
  /**
   * 会話単位のAgent実行モデル（`opencode-go/<modelId>`）。
   * null/未定義はユーザー設定の agentModel（なければ gateway 既定）を使う（P1-013 FR-005/006）。
   */
  agentModel?: string | null;
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
  model?: string;
  createdAt: string;
}

export interface ChatRequest {
  conversationId: string;
  message: string;
}

export type AgentApprovalLevel = 'auto' | 'dangerous-only' | 'always';

export interface UserSettings {
  displayName?: string;
  agentApprovalLevel?: AgentApprovalLevel;
  agentModel?: string;
  agentSubagentModel?: string;
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
