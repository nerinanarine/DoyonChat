#!/bin/bash
set -euo pipefail

ENV=${1:-dev}
RG="rg-opencode-chat-${ENV}"
PARAM_FILE="infra/parameters/${ENV}.parameters.json"

# Secure parameters (passed via environment variables or command line)
OPENCODE_GO_API_KEY="${OPENCODE_GO_API_KEY:-}"
COSMOSDB_KEY="${COSMOSDB_KEY:-}"

echo "Deploying to environment: ${ENV}"
echo "Resource group: ${RG}"

# Validate required parameters
if [[ -z "$OPENCODE_GO_API_KEY" ]]; then
  echo "ERROR: OPENCODE_GO_API_KEY environment variable is not set"
  echo "Usage: OPENCODE_GO_API_KEY=xxx ./infra/scripts/deploy.sh ${ENV}"
  echo "Optional: COSMOSDB_KEY=yyy (auto-retrieved from CosmosDB if omitted)"
  exit 1
fi

# Validate Bicep
echo "=== Validating Bicep ==="
az bicep build --file infra/main.bicep

# Create resource group if not exists
az group create --name "${RG}" --location japaneast --tags "environment=${ENV}" "project=opencode-chat"

# Deploy
echo "=== Deploying resources ==="
# Build deployment parameters
DEPLOY_PARAMS=(
  --resource-group "${RG}"
  --template-file infra/main.bicep
  --parameters "${PARAM_FILE}"
  openCodeGoApiKey="${OPENCODE_GO_API_KEY}"
)

if [[ -n "$COSMOSDB_KEY" ]]; then
  DEPLOY_PARAMS+=(cosmosDbKey="${COSMOSDB_KEY}")
fi

az deployment group create "${DEPLOY_PARAMS[@]}"

echo "=== Deployment complete ==="
