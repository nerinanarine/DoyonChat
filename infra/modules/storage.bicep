// Artifacts 永続化基盤 (P3-016 Phase 1)
// - Storage Account (StorageV2/Standard_LRS) ＋ Azure Files 共有（単一共有＋{userId} ディレクトリ既定案）
//   共有は IaC で作成し、共有内の {userId} ディレクトリは初回利用時に agent 側で自動作成する
// - Storage アクセスキーを Key Vault secret へ格納する（平文キーを bicep/param に置かない）
// 注意（Phase 0 確定）: ACA の Azure Files マウント資格情報（accountKey）には UAMI/KV 参照を
// 使えない（AzureFileProperties に identity なし・getSecret は secure module param 限定）。
// そのためマウント側は agentPool.bicep でデプロイ時 listKeys 取得とし、本 secret は
// Phase 2 の Functions 直接読み取り経路で参照する。
param location string
param tags object
param storageAccountName string
param fileShareName string = 'artifacts'
param keyVaultName string
param storageAccountKeySecretName string = 'artifacts-storage-key'

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

resource fileService 'Microsoft.Storage/storageAccounts/fileServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
}

// 共有自体は IaC 作成。クォータ等は本件スコープ外（後決定）のため指定しない。
resource fileShare 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-05-01' = {
  parent: fileService
  name: fileShareName
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource storageAccountKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: storageAccountKeySecretName
  properties: {
    value: storageAccount.listKeys().keys[0].value
  }
}

output storageAccountName string = storageAccount.name
output storageAccountKeySecretName string = storageAccountKeySecretName
output fileShareName string = fileShare.name
