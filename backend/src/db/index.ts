import { CosmosClient } from '@azure/cosmos';

const client = new CosmosClient({
  endpoint: process.env.COSMOSDB_ENDPOINT!,
  key: process.env.COSMOSDB_KEY!,
});

const database = client.database(process.env.COSMOSDB_DATABASE || 'chatdb');

export const conversationsContainer = database.container('conversations');
export const messagesContainer = database.container('messages');
export default client;
