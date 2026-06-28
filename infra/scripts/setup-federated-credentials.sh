#!/bin/bash
# ---------------------------------------------------------------------------
# setup-federated-credentials.sh
#
# Creates an Azure Service Principal and configures GitHub OIDC Federated
# Credentials for secure password-less authentication from GitHub Actions.
#
# Prerequisites:
#   - Azure CLI (az) installed and logged in
#   - jq installed
#   - Owner or User Access Administrator on the subscription (to create SP)
#
# Usage:
#   ./setup-federated-credentials.sh \
#     --repo "owner/repo" \
#     --subscription-id "00000000-0000-0000-0000-000000000000" \
#     --resource-group "rg-opencode-chat-prod"
#
#   ./setup-federated-credentials.sh --help
# ---------------------------------------------------------------------------
set -euo pipefail

APP_NAME="github-actions-opencode-chat"
ROLE="contributor"

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
REPO=""
SUBSCRIPTION_ID=""
RESOURCE_GROUP=""

print_help() {
  cat <<EOF
Usage: $0 [OPTIONS]

Options:
  --repo <owner/repo>         GitHub repository (required)
  --subscription-id <id>      Azure subscription ID (required)
  --resource-group <name>     Azure resource group name (required)
  --name <app-name>           Service Principal display name
                              (default: github-actions-opencode-chat)
  --role <role>               Azure role to assign (default: contributor)
  -h, --help                  Show this help message

Example:
  $0 --repo "myorg/myrepo" \\
     --subscription-id "00000000-0000-0000-0000-000000000000" \\
     --resource-group "rg-opencode-chat-prod"
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)            REPO="$2"; shift 2 ;;
    --subscription-id) SUBSCRIPTION_ID="$2"; shift 2 ;;
    --resource-group)  RESOURCE_GROUP="$2"; shift 2 ;;
    --name)            APP_NAME="$2"; shift 2 ;;
    --role)            ROLE="$2"; shift 2 ;;
    -h|--help)         print_help ;;
    *) echo "❌ Unknown option: $1"; echo "Use --help for usage."; exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
if [[ -z "$REPO" || -z "$SUBSCRIPTION_ID" || -z "$RESOURCE_GROUP" ]]; then
  echo "❌ Missing required arguments."
  echo "   --repo, --subscription-id, and --resource-group are required."
  echo "   Use --help for usage."
  exit 1
fi

if ! command -v az &> /dev/null; then
  echo "❌ Azure CLI (az) is not installed."
  echo "   Install: https://docs.microsoft.com/cli/azure/install-azure-cli"
  exit 1
fi

if ! command -v jq &> /dev/null; then
  echo "❌ jq is not installed. Install: apt-get install jq / brew install jq"
  exit 1
fi

# Ensure logged in
if ! az account show &> /dev/null; then
  echo "🔐 Not logged in. Running 'az login'..."
  az login
fi

SCOPE="/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}"

echo "============================================================================"
echo "  Azure Federated Credentials Setup"
echo "============================================================================"
echo "  Repository:      ${REPO}"
echo "  Subscription:    ${SUBSCRIPTION_ID}"
echo "  Resource Group:  ${RESOURCE_GROUP}"
echo "  Scope:           ${SCOPE}"
echo "  SP Name:         ${APP_NAME}"
echo "  Role:            ${ROLE}"
echo "============================================================================"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Create Service Principal
# ---------------------------------------------------------------------------
echo "📌 Step 1/3: Creating Service Principal..."
SP_JSON=$(az ad sp create-for-rbac \
  --name "$APP_NAME" \
  --role "$ROLE" \
  --scopes "$SCOPE" \
  --sdk-auth)

APP_ID=$(echo "$SP_JSON" | jq -r '.clientId')
TENANT_ID=$(echo "$SP_JSON" | jq -r '.tenantId')

echo "✅ Service Principal created."
echo "   App ID:     ${APP_ID}"
echo "   Tenant ID:  ${TENANT_ID}"
echo ""

# ---------------------------------------------------------------------------
# Step 2: Federated Credential for main branch
# ---------------------------------------------------------------------------
echo "📌 Step 2/3: Creating federated credential (main branch)..."
az ad app federated-credential create \
  --id "$APP_ID" \
  --parameters "$(cat <<EOF
{
  "name": "github-actions-main",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:${REPO}:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"]
}
EOF
)" > /dev/null
echo "✅ Federated credential 'github-actions-main' created."
echo ""

# ---------------------------------------------------------------------------
# Step 3: Federated Credential for PR events
# ---------------------------------------------------------------------------
echo "📌 Step 3/3: Creating federated credential (PR events)..."
az ad app federated-credential create \
  --id "$APP_ID" \
  --parameters "$(cat <<EOF
{
  "name": "github-actions-pr",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:${REPO}:pull_request",
  "audiences": ["api://AzureADTokenExchange"]
}
EOF
)" > /dev/null
echo "✅ Federated credential 'github-actions-pr' created."
echo ""

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
echo "============================================================================"
echo "  ✅ Setup Complete!"
echo "============================================================================"
echo ""
echo "👉 Next step: Run setup-github-secrets.sh to register the following"
echo "   values in your GitHub repository."
echo ""
echo "──────────────────────────────────────────────────────────────────────────"
echo "  GitHub Secrets to register:"
echo "──────────────────────────────────────────────────────────────────────────"
echo ""
echo "  AZURE_CREDENTIALS:"
echo "  ─────────────────────────────────────────────────────────"
echo "$SP_JSON" | jq .
echo "  ─────────────────────────────────────────────────────────"
echo ""
echo "  AZURE_SUBSCRIPTION_ID:  ${SUBSCRIPTION_ID}"
echo "  AZURE_RESOURCE_GROUP:   ${RESOURCE_GROUP}"
echo ""
echo "──────────────────────────────────────────────────────────────────────────"
echo ""
echo "  To register these automatically, run:"
echo "    ./infra/scripts/setup-github-secrets.sh"
echo ""
