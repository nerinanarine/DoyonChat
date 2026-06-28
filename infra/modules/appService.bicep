param location string
param tags object
param appServicePlanName string
param apiAppName string
param sku object = {
  name: 'P1v2'
  tier: 'PremiumV2'
  capacity: 1
}
param nodeVersion string = '20-lts'
param cosmosDbEndpoint string
param cosmosDbKey string
param openCodeGoApiKey string
param frontendUrl string

resource appServicePlan 'Microsoft.Web/serverfarms@2022-09-01' = {
  name: appServicePlanName
  location: location
  tags: tags
  kind: 'linux'
  properties: {
    reserved: true
  }
  sku: sku
}

resource apiApp 'Microsoft.Web/sites@2022-09-01' = {
  name: apiAppName
  location: location
  tags: tags
  kind: 'app,linux'
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: {
      linuxFxVersion: 'NODE|${nodeVersion}'
      appSettings: [
        { name: 'PORT', value: '3000' }
        { name: 'COSMOSDB_ENDPOINT', value: cosmosDbEndpoint }
        { name: 'COSMOSDB_KEY', value: cosmosDbKey }
        { name: 'COSMOSDB_DATABASE', value: 'chatdb' }
        { name: 'OPENCODE_GO_API_KEY', value: openCodeGoApiKey }
        { name: 'OPENCODE_GO_MODEL', value: 'kimi-k2.6' }
        { name: 'FRONTEND_URL', value: frontendUrl }
        { name: 'WEBSITE_NODE_DEFAULT_VERSION', value: nodeVersion }
        { name: 'SCM_DO_BUILD_DURING_DEPLOYMENT', value: 'false' }
      ]
      alwaysOn: true
      http20Enabled: true
      cors: {
        allowedOrigins: [ frontendUrl ]
      }
    }
    httpsOnly: true
  }
}

output apiAppUrl string = 'https://${apiApp.properties.defaultHostName}'
output apiAppName string = apiApp.name
