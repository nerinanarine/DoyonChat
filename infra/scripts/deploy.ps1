#requires -Version 5.1
$ErrorActionPreference = "Stop"

$ENV = if ($args[0]) { $args[0] } else { "dev" }
$RG = "rg-opencode-chat-${ENV}"
$PARAM_FILE = "infra/parameters/${ENV}.parameters.json"

# Secure parameters (passed via environment variables)
$OPENCODE_GO_API_KEY = if ($env:OPENCODE_GO_API_KEY) { $env:OPENCODE_GO_API_KEY } else { "" }
$COSMOSDB_KEY = if ($env:COSMOSDB_KEY) { $env:COSMOSDB_KEY } else { "" }
$AGENT_AUTH_TENANT = if ($env:AGENT_AUTH_TENANT) { $env:AGENT_AUTH_TENANT } else { "" }
$AGENT_AUTH_AUDIENCE = if ($env:AGENT_AUTH_AUDIENCE) { $env:AGENT_AUTH_AUDIENCE } else { "" }
$AGENT_ENABLED = if ($env:AGENT_ENABLED) { $env:AGENT_ENABLED } else { "false" }
$AUTH_ENABLED = if ($env:AUTH_ENABLED) { $env:AUTH_ENABLED } else { "false" }
$ENTRA_TENANT_ID = if ($env:ENTRA_TENANT_ID) { $env:ENTRA_TENANT_ID } else { "" }
$ENTRA_API_CLIENT_ID = if ($env:ENTRA_API_CLIENT_ID) { $env:ENTRA_API_CLIENT_ID } else { "" }

Write-Host "Deploying to environment: ${ENV}" -ForegroundColor Cyan
Write-Host "Resource group: ${RG}" -ForegroundColor Cyan

# Validate required parameters
if (-not $OPENCODE_GO_API_KEY) {
    Write-Host "ERROR: OPENCODE_GO_API_KEY environment variable is not set" -ForegroundColor Red
    Write-Host "Usage: `$env:OPENCODE_GO_API_KEY = 'xxx'; .\infra\scripts\deploy.ps1 ${ENV}" -ForegroundColor Yellow
    Write-Host "Optional: `$env:COSMOSDB_KEY = 'yyy' (auto-retrieved from CosmosDB if omitted)" -ForegroundColor Yellow
    exit 1
}

# The agent gateway is exposed via ingress. Managed Identity JWT auth is mandatory.
if (-not $AGENT_AUTH_TENANT) {
    Write-Host "ERROR: AGENT_AUTH_TENANT is not set (Entra JWT issuer for the agent gateway)" -ForegroundColor Red
    exit 1
}
if (-not $AGENT_AUTH_AUDIENCE) {
    Write-Host "ERROR: AGENT_AUTH_AUDIENCE is not set (Entra App registration application ID = JWT audience)" -ForegroundColor Red
    exit 1
}

# AGENT_ENABLED=true は公開 gateway（露出）を伴うため、ユーザー認証と連動した堅牢な設定を必須にする。
if ($AGENT_ENABLED -eq "true") {
    if ($AUTH_ENABLED -ne "true") {
        Write-Host "ERROR: AUTH_ENABLED must be true when AGENT_ENABLED is true (agent endpoints require user auth)" -ForegroundColor Red
        exit 1
    }
    if (-not $ENTRA_TENANT_ID) {
        Write-Host "ERROR: ENTRA_TENANT_ID is required when AGENT_ENABLED is true" -ForegroundColor Red
        exit 1
    }
    if (-not $ENTRA_API_CLIENT_ID) {
        Write-Host "ERROR: ENTRA_API_CLIENT_ID is required when AGENT_ENABLED is true" -ForegroundColor Red
        exit 1
    }
}

# Validate Bicep
Write-Host "=== Validating Bicep ===" -ForegroundColor Cyan
az bicep build --file infra/main.bicep
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Create resource group if not exists
Write-Host "=== Ensuring resource group exists ===" -ForegroundColor Cyan
az group create --name $RG --location japaneast --tags "environment=${ENV}" "project=opencode-chat" | Out-Null

# Deploy
Write-Host "=== Deploying resources ===" -ForegroundColor Cyan
$deployArgs = @(
    "--resource-group", $RG,
    "--template-file", "infra/main.bicep",
    "--parameters", $PARAM_FILE,
    "openCodeGoApiKey=$OPENCODE_GO_API_KEY",
    "agentAuthTenant=$AGENT_AUTH_TENANT",
    "agentAuthAudience=$AGENT_AUTH_AUDIENCE",
    "agentEnabled=$AGENT_ENABLED",
    "authEnabled=$AUTH_ENABLED",
    "entraTenantId=$ENTRA_TENANT_ID",
    "entraApiClientId=$ENTRA_API_CLIENT_ID"
)

if ($COSMOSDB_KEY) {
    $deployArgs += "cosmosDbKey=$COSMOSDB_KEY"
}

az deployment group create @deployArgs

Write-Host "=== Deployment complete ===" -ForegroundColor Green
