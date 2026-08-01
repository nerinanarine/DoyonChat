import { Conversation, Message } from '../types';
import { getConversationsContainer, getMessagesContainer } from '../db/index';

let useMemory = false;
const memoryConversations: Map<string, Conversation> = new Map();
const memoryMessages: Map<string, Message> = new Map();

function isAuthenticationEnabled(): boolean {
  return process.env.AUTH_ENABLED !== 'false';
}

function canAccessConversation(conversation: Conversation | null, userId?: string): boolean {
  if (!conversation) return false;
  if (!isAuthenticationEnabled()) return true;
  return Boolean(userId) && conversation.userId === userId;
}

async function ensureConversationContainer() {
  if (useMemory) return;
  try {
    await getConversationsContainer().read();
  } catch {
    useMemory = true;
    console.warn('[conversationService] CosmosDB unavailable, falling back to in-memory store');
  }
}

async function ensureMessageContainer() {
  if (useMemory) return;
  try {
    await getMessagesContainer().read();
  } catch {
    useMemory = true;
    console.warn('[conversationService] CosmosDB unavailable, falling back to in-memory store');
  }
}

export async function listConversations(userId?: string): Promise<Conversation[]> {
  if (isAuthenticationEnabled() && !userId) return [];

  await ensureConversationContainer();
  if (useMemory) {
    return Array.from(memoryConversations.values())
      .filter((conversation) => canAccessConversation(conversation, userId))
      .sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
  }

  if (!isAuthenticationEnabled()) {
    const { resources } = await getConversationsContainer().items
      .query({ query: 'SELECT * FROM c ORDER BY c.updatedAt DESC' })
      .fetchAll();
    return resources;
  }

  const { resources } = await getConversationsContainer().items
    .query({
      query:
        'SELECT * FROM c WHERE IS_DEFINED(c.userId) AND c.userId = @userId ORDER BY c.updatedAt DESC',
      parameters: [{ name: '@userId', value: userId! }],
    })
    .fetchAll();
  return resources;
}

export async function getConversation(
  id: string,
  userId?: string,
): Promise<Conversation | null> {
  if (isAuthenticationEnabled() && !userId) return null;

  await ensureConversationContainer();
  if (useMemory) {
    const conversation = memoryConversations.get(id) || null;
    return canAccessConversation(conversation, userId) ? conversation : null;
  }
  try {
    const { resource } = await getConversationsContainer().item(id, id).read();
    const conversation = (resource as Conversation | undefined) || null;
    return canAccessConversation(conversation, userId) ? conversation : null;
  } catch {
    return null;
  }
}

export async function createConversation(
  title = 'New Chat',
  model = 'kimi-k2.6',
  userId?: string,
): Promise<Conversation> {
  if (isAuthenticationEnabled() && !userId) {
    throw new Error('userId is required when authentication is enabled');
  }

  await ensureConversationContainer();
  const now = new Date().toISOString();
  const conversation: Conversation = {
    id: crypto.randomUUID(),
    userId: userId || 'dev-user',
    title,
    model,
    createdAt: now,
    updatedAt: now,
  };
  if (useMemory) {
    memoryConversations.set(conversation.id, conversation);
    return conversation;
  }
  const { resource } = await getConversationsContainer().items.create(conversation);
  return resource as Conversation;
}

export async function updateConversationModel(
  id: string,
  model: string,
  userId?: string,
): Promise<Conversation | null> {
  const existing = await getConversation(id, userId);
  if (!existing) return null;

  await ensureConversationContainer();
  const updated: Conversation = { ...existing, model, updatedAt: new Date().toISOString() };
  if (useMemory) {
    memoryConversations.set(id, updated);
    return updated;
  }
  const { resource } = await getConversationsContainer().item(id, id).replace(updated);
  return resource as Conversation;
}

export async function deleteConversation(id: string, userId?: string): Promise<boolean> {
  const existing = await getConversation(id, userId);
  if (!existing) return false;

  await ensureMessageContainer();
  if (useMemory) {
    memoryConversations.delete(id);
    for (const [msgId, msg] of memoryMessages) {
      if (msg.conversationId === id) memoryMessages.delete(msgId);
    }
    return true;
  }

  try {
    await getConversationsContainer().item(id, id).delete();
    const { resources: msgs } = await getMessagesContainer().items
      .query(
        {
          query: 'SELECT c.id FROM c WHERE c.conversationId = @conversationId',
          parameters: [{ name: '@conversationId', value: id }],
        },
        { partitionKey: id },
      )
      .fetchAll();
    for (const msg of msgs) {
      await getMessagesContainer().item(msg.id, id).delete();
    }
    return true;
  } catch {
    return false;
  }
}

export async function listMessages(
  conversationId: string,
  userId?: string,
): Promise<Message[]> {
  const conversation = await getConversation(conversationId, userId);
  if (!conversation) return [];

  await ensureMessageContainer();
  if (useMemory) {
    return Array.from(memoryMessages.values())
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }
  const { resources } = await getMessagesContainer().items
    .query(
      {
        query: 'SELECT * FROM c WHERE c.conversationId = @conversationId ORDER BY c.createdAt ASC',
        parameters: [{ name: '@conversationId', value: conversationId }],
      },
      { partitionKey: conversationId },
    )
    .fetchAll();
  return resources;
}

export async function addMessage(
  message: Omit<Message, 'id' | 'createdAt'>,
  userId?: string,
): Promise<Message> {
  const conversation = await getConversation(message.conversationId, userId);
  if (!conversation) {
    throw new Error('Conversation not found');
  }

  await ensureMessageContainer();
  const now = new Date().toISOString();
  const fullMessage: Message = {
    ...message,
    id: crypto.randomUUID(),
    createdAt: now,
  };
  if (useMemory) {
    memoryMessages.set(fullMessage.id, fullMessage);
    conversation.updatedAt = now;
    memoryConversations.set(conversation.id, conversation);
    return fullMessage;
  }
  const { resource } = await getMessagesContainer().items.create(fullMessage);
  conversation.updatedAt = now;
  await getConversationsContainer().item(conversation.id, conversation.id).replace(conversation);
  return resource as Message;
}
