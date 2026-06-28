#requires -Version 5.1
$ErrorActionPreference = "Stop"

$ENV = if ($args[0]) { $args[0] } else { "dev" }
$RG = "rg-opencode-chat-${ENV}"
$PARAM_FILE = "infra/parameters/${ENV}.parameters.json"

# Secure parameters (passed via environment variables)
$OPENCODE_GO_API_KEY = if ($env:OPENCODE_GO_API_KEY) { $env:OPENCODE_GO_API_KEY } else { "" }
$COSMOSDB_KEY = if ($env:COSMOSDB_KEY) { $env:COSMOSDB_KEY } else { "" }

# Validate required parameters
if (-not $OPENCODE_GO_API_KEY) {
    Write-Host "ERROR: OPENCODE_GO_API_KEY is not set." -ForegroundColor Red
    Write-Host ""
    Write-Host "Set it before running this script:" -ForegroundColor Yellow
    Write-Host '  $env:OPENCODE_GO_API_KEY = "sk-your-key-here"' -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Then run:" -ForegroundColor Yellow
    Write-Host "  .\infra\scripts\validate.ps1 ${ENV}" -ForegroundColor Yellow
    Write-Host ""
    Write-Host 'Optional: $env:COSMOSDB_KEY = "your-cosmosdb-key" (auto-retrieved from CosmosDB if omitted)' -ForegroundColor Yellow
    exit 1
}

Write-Host "=== Bicep Lint ===" -ForegroundColor Cyan
az bicep build --file infra/main.bicep
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Ensure resource group exists (what-if fails if RG does not exist)
Write-Host "=== Ensuring resource group exists ===" -ForegroundColor Cyan
az group create --name $RG --location japaneast --tags "environment=${ENV}" "project=opencode-chat" | Out-Null

Write-Host ""
Write-Host "=== Bicep What-If (env: ${ENV}) ===" -ForegroundColor Cyan

$whatIfArgs = @(
    "--resource-group", $RG,
    "--template-file", "infra/main.bicep",
    "--parameters", $PARAM_FILE,
    "openCodeGoApiKey=$OPENCODE_GO_API_KEY"
)

if ($COSMOSDB_KEY) {
    $whatIfArgs += "cosmosDbKey=$COSMOSDB_KEY"
}

az deployment group what-if @whatIfArgs

Write-Host "=== Validation complete ===" -ForegroundColor Green
