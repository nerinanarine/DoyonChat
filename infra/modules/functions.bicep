param location string
param tags object
param functionPlanName string
param functionAppName string
param storageAccountName string
param deploymentContainerName string = 'function-deploy'
param nodeVersion string = '20'
param maximumInstanceCount int = 100
param instanceMemoryMB int = 2048
param cosmosDbEndpoint string
@secure()
param cosmosDbKey string
param cosmosDbDatabase string = 'chatdb'
@secure()
param openCodeGoApiKey string
param openCodeGoModel string = 'kimi-k2.6'
param authEnabled string = 'false'
param entraTenantId string = ''
param entraApiClientId string = ''
param frontendUrl string
param cosmosDbRequired string = 'false'
param appInsightsConnectionString string

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
}

resource deploymentContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: deploymentContainerName
  properties: {
    publicAccess: 'None'
  }
}

resource functionPlan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: functionPlanName
  location: location
  tags: tags
  kind: 'functionapp'
  sku: {
    name: 'FC1'
    tier: 'FlexConsumption'
  }
  properties: {
    reserved: true
  }
}

resource functionApp 'Microsoft.Web/sites@2024-04-01' = {
  name: functionAppName
  location: location
  tags: tags
  kind: 'functionapp,linux'
  properties: {
    serverFarmId: functionPlan.id
    httpsOnly: true
    siteConfig: {
      minTlsVersion: '1.2'
      cors: {
        allowedOrigins: [frontendUrl]
      }
    }
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storageAccount.properties.primaryEndpoints.blob}${deploymentContainerName}'
          authentication: {
            type: 'StorageAccountConnectionString'
            storageAccountConnectionStringName: 'AzureWebJobsStorage'
          }
        }
      }
      runtime: {
        name: 'node'
        version: nodeVersion
      }
      scaleAndConcurrency: {
        maximumInstanceCount: maximumInstanceCount
        instanceMemoryMB: instanceMemoryMB
        alwaysReady: []
      }
    }
  }
}

resource functionAppSettings 'Microsoft.Web/sites/config@2024-04-01' = {
  parent: functionApp
  name: 'appsettings'
  properties: {
    AzureWebJobsStorage: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'
    COSMOSDB_ENDPOINT: cosmosDbEndpoint
    COSMOSDB_KEY: cosmosDbKey
    COSMOSDB_DATABASE: cosmosDbDatabase
    COSMOSDB_REQUIRED: cosmosDbRequired
    OPENCODE_GO_API_KEY: openCodeGoApiKey
    OPENCODE_GO_MODEL: openCodeGoModel
    AUTH_ENABLED: authEnabled
    ENTRA_TENANT_ID: entraTenantId
    ENTRA_API_CLIENT_ID: entraApiClientId
    FRONTEND_URL: frontendUrl
    APPLICATIONINSIGHTS_CONNECTION_STRING: appInsightsConnectionString
  }
}

output functionAppName string = functionApp.name
output functionAppUrl string = 'https://${functionApp.properties.defaultHostName}'
output functionPlanName string = functionPlan.name
output storageAccountName string = storageAccount.name
