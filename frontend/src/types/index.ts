export interface Conversation {
  id: string;
  userId?: string;
  title: string;
  model: string;
  /** 会話ごとのエージェントモード（未保存時は通常チャット）。 */
  agentMode?: boolean;
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

export type AgentApprovalLevel = 'auto' | 'dangerous-only' | 'always';

export interface UserSettings {
  defaultModel?: string;
  displayName?: string;
  agentApprovalLevel?: AgentApprovalLevel;
  agentModel?: string;
  agentSubagentModel?: string;
}

/** gateway の承認要求 SSE（`{approvalRequest: {...}}`）を表す。 */
export interface AgentApprovalRequest {
  id: string;
  runId: string;
  method: string;
  title?: string;
  message?: string;
  expired?: boolean;
}

/** エージェント実行中の進捗イベント（ChatMessageList のタイムライン表示用）。 */
export type AgentStreamEvent =
  | { kind: 'agent_start' }
  | { kind: 'agent_settled' }
  | { kind: 'tool_start'; toolCallId?: string; toolName?: string; args?: unknown }
  | { kind: 'tool_update'; toolCallId?: string; toolName?: string }
  | { kind: 'tool_end'; toolCallId?: string; toolName?: string; isError?: boolean }
  | { kind: 'approval_request' }
  | { kind: 'approval_resolved'; approved: boolean };

export interface UserSettingsResponse {
  userId: string;
  settings: UserSettings;
  updatedAt?: string;
}

export type ModelsStatus = 'loading' | 'error' | 'loaded';

export type SettingsStatus = 'loading' | 'error' | 'loaded';
