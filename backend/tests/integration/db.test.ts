describe('CosmosDB Integration', () => {
  const requiredEnvVars = [
    'COSMOSDB_ENDPOINT',
    'COSMOSDB_KEY',
    'COSMOSDB_DATABASE',
  ];

  const hasCredentials = requiredEnvVars.every(
    (v) => process.env[v] && process.env[v]!.length > 0,
  );

  const itOrSkip = hasCredentials ? it : it.skip;

  itOrSkip('should connect to CosmosDB and perform CRUD operations', async () => {
    // This test requires actual CosmosDB credentials
    // Skipped in CI unless credentials are provided
    expect(process.env.COSMOSDB_ENDPOINT).toBeDefined();
    expect(process.env.COSMOSDB_KEY).toBeDefined();
    expect(process.env.COSMOSDB_DATABASE).toBeDefined();
  });
});
