#!/bin/bash
set -euo pipefail

ENV=${1:-dev}
RG="rg-opencode-chat-${ENV}"
PARAM_FILE="infra/parameters/${ENV}.parameters.json"

# Secure parameters (passed via environment variables)
OPENCODE_GO_API_KEY="${OPENCODE_GO_API_KEY:-}"
COSMOSDB_KEY="${COSMOSDB_KEY:-}"
AGENT_AUTH_TENANT="${AGENT_AUTH_TENANT:-}"
AGENT_AUTH_AUDIENCE="${AGENT_AUTH_AUDIENCE:-}"
AGENT_ENABLED="${AGENT_ENABLED:-false}"
AUTH_ENABLED="${AUTH_ENABLED:-false}"
ENTRA_TENANT_ID="${ENTRA_TENANT_ID:-}"
ENTRA_API_CLIENT_ID="${ENTRA_API_CLIENT_ID:-}"

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

# The agent gateway is exposed via ingress. Managed Identity JWT auth is mandatory.
if [[ -z "$AGENT_AUTH_TENANT" ]]; then
  echo "ERROR: AGENT_AUTH_TENANT is not set (Entra JWT issuer required for the agent gateway)."
  exit 1
fi
if [[ -z "$AGENT_AUTH_AUDIENCE" ]]; then
  echo "ERROR: AGENT_AUTH_AUDIENCE is not set (Entra App registration application ID = JWT audience)."
  exit 1
fi

# AGENT_ENABLED=true は公開 gateway を伴うため、ユーザー認証（AUTH_ENABLED）と同一条件を必須にする。
if [[ "$AGENT_ENABLED" == "true" ]]; then
  if [[ "$AUTH_ENABLED" != "true" ]]; then
    echo "ERROR: AUTH_ENABLED must be true when AGENT_ENABLED is true."
    exit 1
  fi
  if [[ -z "$ENTRA_TENANT_ID" ]]; then
    echo "ERROR: ENTRA_TENANT_ID is required when AGENT_ENABLED is true."
    exit 1
  fi
  if [[ -z "$ENTRA_API_CLIENT_ID" ]]; then
    echo "ERROR: ENTRA_API_CLIENT_ID is required when AGENT_ENABLED is true."
    exit 1
  fi
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
  agentAuthTenant="${AGENT_AUTH_TENANT}"
  agentAuthAudience="${AGENT_AUTH_AUDIENCE}"
  agentEnabled="${AGENT_ENABLED}"
  authEnabled="${AUTH_ENABLED}"
  entraTenantId="${ENTRA_TENANT_ID}"
  entraApiClientId="${ENTRA_API_CLIENT_ID}"
)

if [[ -n "$COSMOSDB_KEY" ]]; then
  WHATIF_PARAMS+=(cosmosDbKey="${COSMOSDB_KEY}")
fi

az deployment group what-if "${WHATIF_PARAMS[@]}"

echo "=== Validation complete ==="
