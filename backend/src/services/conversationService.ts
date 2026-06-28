import { Conversation, Message } from '../types';
import { conversationsContainer, messagesContainer } from '../db/index';

let useMemory = false;
const memoryConversations: Map<string, Conversation> = new Map();
const memoryMessages: Map<string, Message> = new Map();

async function ensureConversationContainer() {
  if (useMemory) return;
  try {
    await conversationsContainer.read();
  } catch {
    useMemory = true;
    console.warn('[conversationService] CosmosDB unavailable, falling back to in-memory store');
  }
}

async function ensureMessageContainer() {
  if (useMemory) return;
  try {
    await messagesContainer.read();
  } catch {
    useMemory = true;
    console.warn('[conversationService] CosmosDB unavailable, falling back to in-memory store');
  }
}

export async function listConversations(): Promise<Conversation[]> {
  await ensureConversationContainer();
  if (useMemory) {
    return Array.from(memoryConversations.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }
  const { resources } = await conversationsContainer.items
    .query({ query: 'SELECT * FROM c ORDER BY c.updatedAt DESC' })
    .fetchAll();
  return resources;
}

export async function getConversation(id: string): Promise<Conversation | null> {
  await ensureConversationContainer();
  if (useMemory) {
    return memoryConversations.get(id) || null;
  }
  try {
    const { resource } = await conversationsContainer.item(id, id).read();
    return resource || null;
  } catch {
    return null;
  }
}

export async function createConversation(title = 'New Chat', model = 'kimi-k2.6'): Promise<Conversation> {
  await ensureConversationContainer();
  const now = new Date().toISOString();
  const conversation: Conversation = {
    id: crypto.randomUUID(),
    title,
    model,
    createdAt: now,
    updatedAt: now,
  };
  if (useMemory) {
    memoryConversations.set(conversation.id, conversation);
    return conversation;
  }
  const { resource } = await conversationsContainer.items.create(conversation);
  return resource as Conversation;
}

export async function updateConversationModel(id: string, model: string): Promise<Conversation | null> {
  await ensureConversationContainer();
  const existing = await getConversation(id);
  if (!existing) return null;
  const updated: Conversation = { ...existing, model, updatedAt: new Date().toISOString() };
  if (useMemory) {
    memoryConversations.set(id, updated);
    return updated;
  }
  const { resource } = await conversationsContainer.item(id, id).replace(updated);
  return resource as Conversation;
}

export async function deleteConversation(id: string): Promise<boolean> {
  await ensureConversationContainer();
  await ensureMessageContainer();
  if (useMemory) {
    memoryConversations.delete(id);
    for (const [msgId, msg] of memoryMessages) {
      if (msg.conversationId === id) memoryMessages.delete(msgId);
    }
    return true;
  }
  try {
    await conversationsContainer.item(id, id).delete();
    const { resources: msgs } = await messagesContainer.items
      .query(
        { query: 'SELECT c.id FROM c WHERE c.conversationId = @conversationId', parameters: [{ name: '@conversationId', value: id }] },
        { partitionKey: id }
      )
      .fetchAll();
    for (const msg of msgs) {
      await messagesContainer.item(msg.id, id).delete();
    }
    return true;
  } catch {
    return false;
  }
}

export async function listMessages(conversationId: string): Promise<Message[]> {
  await ensureMessageContainer();
  if (useMemory) {
    return Array.from(memoryMessages.values())
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }
  const { resources } = await messagesContainer.items
    .query(
      { query: 'SELECT * FROM c WHERE c.conversationId = @conversationId ORDER BY c.createdAt ASC', parameters: [{ name: '@conversationId', value: conversationId }] },
      { partitionKey: conversationId }
    )
    .fetchAll();
  return resources;
}

export async function addMessage(message: Omit<Message, 'id' | 'createdAt'>): Promise<Message> {
  await ensureMessageContainer();
  const now = new Date().toISOString();
  const fullMessage: Message = {
    ...message,
    id: crypto.randomUUID(),
    createdAt: now,
  };
  if (useMemory) {
    memoryMessages.set(fullMessage.id, fullMessage);
    // Update conversation updatedAt
    const conv = memoryConversations.get(message.conversationId);
    if (conv) {
      conv.updatedAt = now;
    }
    return fullMessage;
  }
  const { resource } = await messagesContainer.items.create(fullMessage);
  // Update conversation updatedAt
  const conv = await getConversation(message.conversationId);
  if (conv) {
    conv.updatedAt = now;
    await conversationsContainer.item(conv.id, conv.id).replace(conv);
  }
  return resource as Message;
}
