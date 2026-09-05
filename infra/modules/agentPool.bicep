// Agent gateway 基盤 (P3-010 Phase 3)
// - ACR（admin 無効・UAMI AcrPull 引き）
// - ACA 環境（Consumption・min=max=1・方式A固定）
// - Container App（ingress external・8787・Key Vault secret 参照）
// - Key Vault secret（opencode-api-key）の取得権限（UAMI secrets:get）
// - gateway 向け env 注入（GATEWAY_AUTH_* は設定時のみ JWT 検証が有効になる）
param location string
param tags object

param containerAppEnvironmentName string
param containerAppName string
param containerRegistryName string
param userAssignedIdentityName string

param keyVaultName string
param keyVaultUri string
param openCodeApiKeySecretName string = 'opencode-api-key'

param tenantId string
@description('Gateway JWT issuer tenant (exposed gateway requires Managed Identity auth)')
param agentAuthTenant string
@description('Gateway JWT audience = Entra App registration application ID (exposed gateway requires it)')
param agentAuthAudience string
param agentModelScope string = ''
param agentDefaultModel string = ''
param agentMaxRuns int = 4
param agentPromptTimeoutMs int = 180000
param agentApprovalTimeoutMs int = 120000
param gatewayHeartbeatMs int = 15000
param gatewayRunTtlMs int = 600000
param gatewayRegistryMax int = 200
param dataDir string = '/app/data'
param toolsFile string = ''
param imageName string = 'doyonchat-agent-gateway:latest'
param cpu int = 1
param memory string = '1.0Gi'
param appInsightsConnectionString string

resource userAssignedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: userAssignedIdentityName
  location: location
  tags: tags
}

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: containerRegistryName
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
  }
}

// UAMI に ACR からイメージを引く権限（AcrPull）
// AcrPull 組み込みロール: 7f781d1c-7f45-4d98-b7e5-1cfd4c4a9b02
resource acrPullAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid('acr-pull-${containerRegistryName}-${userAssignedIdentityName}')
  scope: containerRegistry
  properties: {
    principalId: userAssignedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '7f781d1c-7f45-4d98-b7e5-1cfd4c4a9b02'
    )
  }
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

// Container App の UAMI に Key Vault secret の取得権限を追加（既存 accessPolicies 流儀）
resource keyVaultAccessPolicy 'Microsoft.KeyVault/vaults/accessPolicies@2023-07-01' = {
  parent: keyVault
  name: 'add'
  properties: {
    accessPolicies: [
      {
        tenantId: tenantId
        objectId: userAssignedIdentity.properties.principalId
        permissions: {
          secrets: ['get']
        }
      }
    ]
  }
}

resource containerAppEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: containerAppEnvironmentName
  location: location
  tags: tags
  properties: {
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
        minimumCount: 0
        maximumCount: 1
      }
    ]
  }
}

var envCore = [
  { name: 'GATEWAY_HOST', value: '0.0.0.0' }
  { name: 'GATEWAY_PORT', value: '8787' }
  { name: 'OPENCODE_API_KEY', secretRef: 'opencode-api-key' }
  { name: 'AGENT_DATA_DIR', value: dataDir }
  { name: 'AGENT_PROMPT_TIMEOUT_MS', value: '${agentPromptTimeoutMs}' }
  { name: 'AGENT_APPROVAL_TIMEOUT_MS', value: '${agentApprovalTimeoutMs}' }
  { name: 'GATEWAY_HEARTBEAT_MS', value: '${gatewayHeartbeatMs}' }
  { name: 'GATEWAY_RUN_TTL_MS', value: '${gatewayRunTtlMs}' }
  { name: 'GATEWAY_REGISTRY_MAX', value: '${gatewayRegistryMax}' }
  { name: 'GATEWAY_MAX_RUNS', value: '${agentMaxRuns}' }
  { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
]

var envOptional = concat(
  agentModelScope != '' ? [{ name: 'AGENT_MODEL_SCOPE', value: agentModelScope }] : [],
  agentDefaultModel != '' ? [{ name: 'AGENT_DEFAULT_MODEL', value: agentDefaultModel }] : [],
  agentAuthTenant != '' ? [{ name: 'GATEWAY_AUTH_TENANT', value: agentAuthTenant }] : [],
  agentAuthAudience != '' ? [{ name: 'GATEWAY_AUTH_AUDIENCE', value: agentAuthAudience }] : [],
  toolsFile != '' ? [{ name: 'AGENT_TOOLS_FILE', value: toolsFile }] : []
)

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: containerAppName
  location: location
  tags: tags
  dependsOn: [
    keyVaultAccessPolicy
  ]
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${userAssignedIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerAppEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8787
        transport: 'auto'
        allowInsecure: false
      }
      registries: [
        {
          server: containerRegistry.properties.loginServer
          identity: userAssignedIdentity.id
        }
      ]
      secrets: [
        {
          name: 'opencode-api-key'
          keyVaultUrl: '${keyVaultUri}secrets/${openCodeApiKeySecretName}'
          identity: userAssignedIdentity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'agent-gateway'
          image: '${containerRegistry.properties.loginServer}/${imageName}'
          resources: {
            cpu: cpu
            memory: memory
          }
          env: concat(envCore, envOptional)
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
}

output agentGatewayUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output agentContainerAppName string = containerApp.name
output containerRegistryName string = containerRegistry.name
output containerRegistryLoginServer string = containerRegistry.properties.loginServer
output userAssignedIdentityPrincipalId string = userAssignedIdentity.properties.principalId