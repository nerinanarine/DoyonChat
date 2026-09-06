param location string
param tags object
param keyVaultName string
param tenantId string
param objectId string
param openCodeApiKeySecretName string = 'opencode-api-key'
@secure()
param openCodeGoApiKey string = ''

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  tags: tags
  properties: {
    tenantId: tenantId
    sku: { name: 'standard', family: 'A' }
    accessPolicies: [
      {
        tenantId: tenantId
        objectId: objectId
        permissions: {
          secrets: ['get', 'list', 'set', 'delete']
        }
      }
    ]
    softDeleteRetentionInDays: 7
    enablePurgeProtection: true
  }
}

// Agent gateway の OPENCODE_API_KEY 供給源。空の場合は作成しない。
resource openCodeApiKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (openCodeGoApiKey != '') {
  parent: keyVault
  name: openCodeApiKeySecretName
  properties: {
    value: openCodeGoApiKey
  }
}

output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
output openCodeApiKeySecretName string = openCodeApiKeySecretName
