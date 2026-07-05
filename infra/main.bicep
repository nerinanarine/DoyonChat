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

@description('App Service Plan SKU')
param appServiceSku object = {
  name: 'P1v2'
  tier: 'PremiumV2'
  capacity: 1
}

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

// Resource names with environment suffix
var cosmosDbAccountName = 'cosmos-${environment}-${uniqueString(resourceGroup().id)}'
var appServicePlanName = 'asp-${environment}-${uniqueString(resourceGroup().id)}'
var apiAppName = 'api-${environment}-${uniqueString(resourceGroup().id)}'
var staticWebAppName = 'swa-${environment}-${uniqueString(resourceGroup().id)}'
var keyVaultName = 'kv-${environment}-${uniqueString(resourceGroup().id)}'
var appInsightsName = 'appi-${environment}'
var logAnalyticsWorkspaceName = 'log-${environment}'

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
  }
}

module appService './modules/appService.bicep' = {
  name: 'appservice-module'
  params: {
    location: location
    tags: tags
    appServicePlanName: appServicePlanName
    apiAppName: apiAppName
    sku: appServiceSku
    cosmosDbEndpoint: cosmosdb.outputs.cosmosDbEndpoint
    cosmosDbKey: cosmosDbKey != '' ? cosmosDbKey : cosmosdb.outputs.cosmosDbPrimaryKey
    openCodeGoApiKey: openCodeGoApiKey
    frontendUrl: environment == 'dev'
      ? 'http://localhost:5173'
      : 'https://${staticWebAppName}.azurestaticapps.net'
  }
}

module staticWebApp './modules/staticWebApp.bicep' = {
  name: 'staticwebapp-module'
  params: {
    location: 'eastasia'
    tags: tags
    staticWebAppName: staticWebAppName
    apiUrl: appService.outputs.apiAppUrl
  }
}

output apiAppName string = appService.outputs.apiAppName
output apiUrl string = appService.outputs.apiAppUrl
output frontendUrl string = staticWebApp.outputs.staticWebAppUrl
output cosmosDbEndpoint string = cosmosdb.outputs.cosmosDbEndpoint
output appInsightsConnectionString string = appInsights.outputs.appInsightsConnectionString
