import { CosmosClient } from '@azure/cosmos';

let client: CosmosClient | null = null;

export function getCosmosClient(): CosmosClient {
  if (!client) {
    client = new CosmosClient({
      endpoint: process.env.COSMOSDB_ENDPOINT!,
      key: process.env.COSMOSDB_KEY!,
    });
  }
  return client;
}

export function getDatabase() {
  return getCosmosClient().database(process.env.COSMOSDB_DATABASE || 'chatdb');
}

export function getConversationsContainer() {
  return getDatabase().container('conversations');
}

export function getMessagesContainer() {
  return getDatabase().container('messages');
}

// Backward-compatible default export for non-test usage
export default getCosmosClient;
