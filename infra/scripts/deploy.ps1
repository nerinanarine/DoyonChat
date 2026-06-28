#requires -Version 5.1
$ErrorActionPreference = "Stop"

$ENV = if ($args[0]) { $args[0] } else { "dev" }
$RG = "rg-opencode-chat-${ENV}"
$PARAM_FILE = "infra/parameters/${ENV}.parameters.json"

# Secure parameters (passed via environment variables)
$OPENCODE_GO_API_KEY = if ($env:OPENCODE_GO_API_KEY) { $env:OPENCODE_GO_API_KEY } else { "" }
$COSMOSDB_KEY = if ($env:COSMOSDB_KEY) { $env:COSMOSDB_KEY } else { "" }

Write-Host "Deploying to environment: ${ENV}" -ForegroundColor Cyan
Write-Host "Resource group: ${RG}" -ForegroundColor Cyan

# Validate required parameters
if (-not $OPENCODE_GO_API_KEY) {
    Write-Host "ERROR: OPENCODE_GO_API_KEY environment variable is not set" -ForegroundColor Red
    Write-Host "Usage: `$env:OPENCODE_GO_API_KEY = 'xxx'; .\infra\scripts\deploy.ps1 ${ENV}" -ForegroundColor Yellow
    Write-Host "Optional: `$env:COSMOSDB_KEY = 'yyy' (auto-retrieved from CosmosDB if omitted)" -ForegroundColor Yellow
    exit 1
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
    "openCodeGoApiKey=$OPENCODE_GO_API_KEY"
)

if ($COSMOSDB_KEY) {
    $deployArgs += "cosmosDbKey=$COSMOSDB_KEY"
}

az deployment group create @deployArgs

Write-Host "=== Deployment complete ===" -ForegroundColor Green
