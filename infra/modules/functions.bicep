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
param openCodeGoTitleModel string = 'deepseek-v4-flash'
param authEnabled string = 'false'
param entraTenantId string = ''
param entraApiClientId string = ''
param frontendUrl string
param cosmosDbRequired string = 'false'
param appInsightsConnectionString string
param agentGatewayUrl string = ''
param agentGatewayAudience string = ''
param agentEnabled string = 'false'
@description('Artifacts 用 Azure Files 共有を保持する Storage Account 名 (P3-016 FR-003)')
param artifactsStorageAccountName string
@description('Artifacts 用 Azure Files 共有名')
param artifactsShareName string = 'artifacts'
@description('Artifacts Storage キー secret を保持する Key Vault の URI')
param keyVaultUri string
@description('Artifacts Storage キー secret を保持する Key Vault 名')
param keyVaultName string
@description('Azure AD tenant ID for the Key Vault access policy')
param tenantId string
@description('Artifacts Storage キーを格納した Key Vault secret 名')
param artifactsStorageKeySecretName string = 'artifacts-storage-key'

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
  identity: {
    type: 'SystemAssigned'
  }
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

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

// Function App の system-assigned MI に Key Vault secret の取得権限を追加（agentPool.bicep と同型）。
// 注意: accessPolicies の resource 名は 'add' | 'remove' | 'replace' の固定値（BCP036）のため、
// agentPool.bicep の同名 resource とは resourceId を共有する（デプロイ順は agentPool → functions で
// 直列になるため、'add' の追記セマンティクスで両 policy が共存する）。
resource keyVaultAccessPolicy 'Microsoft.KeyVault/vaults/accessPolicies@2023-07-01' = {
  parent: keyVault
  name: 'add'
  properties: {
    accessPolicies: [
      {
        tenantId: tenantId
        objectId: functionApp.identity.principalId
        permissions: {
          secrets: ['get']
        }
      }
    ]
  }
}

resource functionAppSettings 'Microsoft.Web/sites/config@2024-04-01' = {
  parent: functionApp
  name: 'appsettings'
  dependsOn: [
    keyVaultAccessPolicy
  ]
  properties: {
    AzureWebJobsStorage: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'
    COSMOSDB_ENDPOINT: cosmosDbEndpoint
    COSMOSDB_KEY: cosmosDbKey
    COSMOSDB_DATABASE: cosmosDbDatabase
    COSMOSDB_REQUIRED: cosmosDbRequired
    OPENCODE_GO_API_KEY: openCodeGoApiKey
    OPENCODE_GO_MODEL: openCodeGoModel
    OPENCODE_GO_TITLE_MODEL: openCodeGoTitleModel
    AUTH_ENABLED: authEnabled
    ENTRA_TENANT_ID: entraTenantId
    ENTRA_API_CLIENT_ID: entraApiClientId
    FRONTEND_URL: frontendUrl
    APPLICATIONINSIGHTS_CONNECTION_STRING: appInsightsConnectionString
    AGENT_GATEWAY_URL: agentGatewayUrl
    AGENT_GATEWAY_AUDIENCE: agentGatewayAudience
    AGENT_ENABLED: agentEnabled
    ARTIFACTS_STORAGE_ACCOUNT: artifactsStorageAccountName
    ARTIFACTS_SHARE_NAME: artifactsShareName
    // 平文キーを bicep に置かない（Key Vault 参照。secret は storage.bicep が作成）
    ARTIFACTS_STORAGE_KEY: '@Microsoft.KeyVault(SecretUri=${keyVaultUri}secrets/${artifactsStorageKeySecretName})'
  }
}

output functionAppName string = functionApp.name
output functionAppUrl string = 'https://${functionApp.properties.defaultHostName}'
output functionPlanName string = functionPlan.name
output storageAccountName string = storageAccount.name
