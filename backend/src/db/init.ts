import { CosmosClient, PartitionKeyKind } from '@azure/cosmos';
import dotenv from 'dotenv';

dotenv.config();

const client = new CosmosClient({
  endpoint: process.env.COSMOSDB_ENDPOINT!,
  key: process.env.COSMOSDB_KEY!,
});

async function init() {
  const { database } = await client.databases.createIfNotExists({
    id: process.env.COSMOSDB_DATABASE || 'chatdb',
  });

  await database.containers.createIfNotExists({
    id: 'conversations',
    partitionKey: { paths: ['/id'], kind: PartitionKeyKind.Hash },
  });

  await database.containers.createIfNotExists({
    id: 'messages',
    partitionKey: { paths: ['/conversationId'], kind: PartitionKeyKind.Hash },
  });

  console.log('CosmosDB containers initialized successfully');
}

init().catch((err) => {
  console.error('Failed to initialize CosmosDB:', err);
  process.exit(1);
});
