#!/bin/bash
set -euo pipefail

ENV=${1:-dev}
RG="rg-opencode-chat-${ENV}"
PARAM_FILE="infra/parameters/${ENV}.parameters.json"

# Secure parameters (passed via environment variables)
OPENCODE_GO_API_KEY="${OPENCODE_GO_API_KEY:-}"
COSMOSDB_KEY="${COSMOSDB_KEY:-}"

# Validate required parameters
if [[ -z "$OPENCODE_GO_API_KEY" ]]; then
  echo "ERROR: OPENCODE_GO_API_KEY is not set."
  echo ""
  echo "Set it before running this script:"
  echo '  export OPENCODE_GO_API_KEY="sk-your-key-here"'
  echo ""
  echo "Then run:"
  echo "  ./infra/scripts/validate.sh ${ENV}"
  echo ""
  echo "Optional: export COSMOSDB_KEY=\"your-cosmosdb-key\" (auto-retrieved from CosmosDB if omitted)"
  exit 1
fi

echo "=== Bicep Lint ==="
az bicep build --file infra/main.bicep

# Ensure resource group exists (what-if fails if RG does not exist)
echo "=== Ensuring resource group exists ==="
az group create --name "${RG}" --location japaneast --tags "environment=${ENV}" "project=opencode-chat"

echo ""
echo "=== Bicep What-If (env: ${ENV}) ==="

WHATIF_PARAMS=(
  --resource-group "${RG}"
  --template-file infra/main.bicep
  --parameters "${PARAM_FILE}"
  openCodeGoApiKey="${OPENCODE_GO_API_KEY}"
)

if [[ -n "$COSMOSDB_KEY" ]]; then
  WHATIF_PARAMS+=(cosmosDbKey="${COSMOSDB_KEY}")
fi

az deployment group what-if "${WHATIF_PARAMS[@]}"

echo "=== Validation complete ==="
