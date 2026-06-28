param location string
param tags object
param keyVaultName string
param tenantId string
param objectId string

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

output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
