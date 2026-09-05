targetScope = 'resourceGroup'

@description('Environment name (dev, staging, prod)')
param environment string

@description('Location for all resources')
param location string = resourceGroup().location

@description('Tags applied to all resources')
param tags object = {
  environment: environment
  project: 'opencode-chat'
  managedBy: 'bicep'
}

@description('CosmosDB database name')
param cosmosDbDatabaseName string = 'chatdb'

@description('OpenCode Go API key')
@secure()
param openCodeGoApiKey string

@description('CosmosDB primary key (optional, auto-retrieved if omitted)')
@secure()
param cosmosDbKey string = ''

@description('Azure AD tenant ID for Key Vault')
param tenantId string

@description('Azure AD object ID for Key Vault access')
param objectId string

@description('Enable Entra ID authentication for the Functions app')
param authEnabled string = 'false'

@description('Entra ID tenant ID used by the API authentication verifier')
param entraTenantId string = ''

@description('Entra ID API application client ID used as the JWT audience')
param entraApiClientId string = ''

@description('Agent gateway auth tenant (Managed Identity JWT issuer). Required for exposed gateways.')
param agentAuthTenant string

@description('Agent gateway auth audience (Entra App registration application ID). Required for exposed gateways.')
param agentAuthAudience string

@description('Agent feature kill switch (false = disabled)')
param agentEnabled string = 'false'

@description('Agent model scope pattern (comma separated, empty = all allowed)')
param agentModelScope string = ''

@description('Agent default model (provider/id). Verified against scope at gateway startup.')
param agentDefaultModel string = 'opencode-go/muse-spark-1.3-contributor'

// Resource names with environment suffix
var cosmosDbAccountName = 'cosmos-${environment}-${uniqueString(resourceGroup().id)}'
var functionPlanName = 'fcp-${environment}-${uniqueString(resourceGroup().id)}'
var functionAppName = 'func-${environment}-${uniqueString(resourceGroup().id)}'
var functionsStorageAccountName = 'st${environment}${uniqueString(resourceGroup().id)}'
var functionsDeploymentContainerName = 'function-deploy'
var cosmosDbRequired = environment == 'dev' ? 'false' : 'true'
var staticWebAppName = 'swa-${environment}-${uniqueString(resourceGroup().id)}'
var keyVaultName = 'kv-${environment}-${uniqueString(resourceGroup().id)}'
var appInsightsName = 'appi-${environment}'
var logAnalyticsWorkspaceName = 'log-${environment}'
var containerAppEnvironmentName = 'cae-${environment}-${uniqueString(resourceGroup().id)}'
var containerAppName = 'agent-${environment}-${uniqueString(resourceGroup().id)}'
var containerRegistryName = 'acr${environment}${uniqueString(resourceGroup().id)}'
var userAssignedIdentityName = 'uami-${environment}-${uniqueString(resourceGroup().id)}'

module monitor './modules/monitor.bicep' = {
  name: 'monitor-module'
  params: {
    location: location
    tags: tags
    logAnalyticsWorkspaceName: logAnalyticsWorkspaceName
  }
}

module cosmosdb './modules/cosmosdb.bicep' = {
  name: 'cosmosdb-module'
  params: {
    location: location
    tags: tags
    cosmosDbAccountName: cosmosDbAccountName
    cosmosDbDatabaseName: cosmosDbDatabaseName
  }
}

module appInsights './modules/appInsights.bicep' = {
  name: 'appinsights-module'
  params: {
    location: location
    tags: tags
    appInsightsName: appInsightsName
    logAnalyticsWorkspaceId: monitor.outputs.logAnalyticsWorkspaceId
  }
}

module keyVault './modules/keyVault.bicep' = {
  name: 'keyvault-module'
  params: {
    location: location
    tags: tags
    keyVaultName: keyVaultName
    tenantId: tenantId
    objectId: objectId
    openCodeGoApiKey: openCodeGoApiKey
  }
}

module agentPool './modules/agentPool.bicep' = {
  name: 'agentpool-module'
  params: {
    location: location
    tags: tags
    containerAppEnvironmentName: containerAppEnvironmentName
    containerAppName: containerAppName
    containerRegistryName: containerRegistryName
    userAssignedIdentityName: userAssignedIdentityName
    keyVaultName: keyVault.outputs.keyVaultName
    keyVaultUri: keyVault.outputs.keyVaultUri
    openCodeApiKeySecretName: keyVault.outputs.openCodeApiKeySecretName
    tenantId: tenantId
    agentAuthTenant: agentAuthTenant
    agentAuthAudience: agentAuthAudience
    agentModelScope: agentModelScope
    agentDefaultModel: agentDefaultModel
    appInsightsConnectionString: appInsights.outputs.appInsightsConnectionString
  }
}

module staticWebApp './modules/staticWebApp.bicep' = {
  name: 'staticwebapp-module'
  params: {
    location: 'eastasia'
    tags: tags
    staticWebAppName: staticWebAppName
  }
}

module functions './modules/functions.bicep' = {
  name: 'functions-module'
  params: {
    location: location
    tags: tags
    functionPlanName: functionPlanName
    functionAppName: functionAppName
    storageAccountName: functionsStorageAccountName
    deploymentContainerName: functionsDeploymentContainerName
    cosmosDbEndpoint: cosmosdb.outputs.cosmosDbEndpoint
    cosmosDbKey: cosmosDbKey != '' ? cosmosDbKey : cosmosdb.outputs.cosmosDbPrimaryKey
    openCodeGoApiKey: openCodeGoApiKey
    authEnabled: authEnabled
    entraTenantId: entraTenantId
    entraApiClientId: entraApiClientId
    frontendUrl: staticWebApp.outputs.staticWebAppUrl
    cosmosDbRequired: cosmosDbRequired
    appInsightsConnectionString: appInsights.outputs.appInsightsConnectionString
    agentGatewayUrl: agentPool.outputs.agentGatewayUrl
    agentGatewayAudience: agentAuthAudience
    agentEnabled: agentEnabled
  }
}

output functionAppName string = functions.outputs.functionAppName
output functionApiUrl string = functions.outputs.functionAppUrl
output functionPlanName string = functions.outputs.functionPlanName
output frontendUrl string = staticWebApp.outputs.staticWebAppUrl
output cosmosDbEndpoint string = cosmosdb.outputs.cosmosDbEndpoint
output appInsightsConnectionString string = appInsights.outputs.appInsightsConnectionString
output agentGatewayUrl string = agentPool.outputs.agentGatewayUrl
output agentContainerAppName string = agentPool.outputs.agentContainerAppName
output containerRegistryName string = agentPool.outputs.containerRegistryName
