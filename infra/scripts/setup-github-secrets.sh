#!/bin/bash
# ---------------------------------------------------------------------------
# setup-github-secrets.sh
#
# Registers required GitHub Secrets and Variables for the CI/CD pipeline
# using the GitHub CLI (gh).
#
# Prerequisites:
#   - GitHub CLI (gh) installed and authenticated
#   - Run setup-federated-credentials.sh first to obtain AZURE_CREDENTIALS
#
# Usage (non-interactive):
#   ./setup-github-secrets.sh \
#     --repo "owner/repo" \
#     --azure-credentials '{"clientId":"...","clientSecret":"...",...}' \
#     --subscription-id "00000000-0000-0000-0000-000000000000" \
#     --resource-group "rg-opencode-chat-prod" \
#     --opencode-api-key "sk-..." \
#     --cosmosdb-key "..." \
#     --location "japaneast" \
#     --app-service-name "api-prod" \
#     --static-web-app-name "opencode-chat"
#
# Usage (interactive):
#   ./setup-github-secrets.sh
#   (prompts for each value)
# ---------------------------------------------------------------------------
set -euo pipefail

print_help() {
  cat <<EOF
Usage: $0 [OPTIONS]

Options:
  -h, --help                  Show this help message
  --repo <owner/repo>         GitHub repository (auto-detected from git remote
                              if omitted)
  --azure-credentials <json>  Azure SP credentials JSON (from setup-federated-
                              credentials.sh output)
  --subscription-id <id>      Azure subscription ID
  --resource-group <name>     Azure resource group name
  --opencode-api-key <key>    OpenCode Go API key
  --cosmosdb-key <key>        CosmosDB access key
  --location <region>         Azure region (default: japaneast)
  --app-service-name <name>   App Service name
  --static-web-app-name <name> Static Web App name

If any value is omitted, you will be prompted interactively.
EOF
  exit 0
}

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
REPO=""
AZURE_CREDENTIALS=""
SUBSCRIPTION_ID=""
RESOURCE_GROUP=""
OPENCODE_API_KEY=""
COSMOSDB_KEY=""
LOCATION=""
APP_SERVICE_NAME=""
SWA_NAME=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)              print_help ;;
    --repo)                 REPO="$2"; shift 2 ;;
    --azure-credentials)    AZURE_CREDENTIALS="$2"; shift 2 ;;
    --subscription-id)      SUBSCRIPTION_ID="$2"; shift 2 ;;
    --resource-group)       RESOURCE_GROUP="$2"; shift 2 ;;
    --opencode-api-key)     OPENCODE_API_KEY="$2"; shift 2 ;;
    --cosmosdb-key)         COSMOSDB_KEY="$2"; shift 2 ;;
    --location)             LOCATION="$2"; shift 2 ;;
    --app-service-name)     APP_SERVICE_NAME="$2"; shift 2 ;;
    --static-web-app-name)  SWA_NAME="$2"; shift 2 ;;
    *) echo "❌ Unknown option: $1"; echo "Use --help for usage."; exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
if ! command -v gh &> /dev/null; then
  echo "❌ GitHub CLI (gh) is not installed."
  echo "   Install: https://cli.github.com/"
  exit 1
fi

if ! gh auth status &> /dev/null; then
  echo "❌ Not authenticated with GitHub CLI."
  echo "   Run 'gh auth login' first."
  exit 1
fi

# Auto-detect repo from git remote if not specified
if [[ -z "$REPO" ]]; then
  REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner' 2>/dev/null || echo "")
  if [[ -z "$REPO" ]]; then
    echo "❌ Could not auto-detect GitHub repository."
    echo "   Run from a git repo or specify --repo <owner/repo>."
    exit 1
  fi
  echo "📌 Detected repository: ${REPO}"
fi

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------
set_secret() {
  local name="$1"
  local value="$2"
  local description="$3"

  if [[ -z "$value" ]]; then
    read -r -s -p "  Enter ${description} (${name}): " value
    echo ""
  fi

  if [[ -z "$value" ]]; then
    echo "  ⚠️  Skipping ${name} (no value provided)"
    return
  fi

  echo "$value" | gh secret set "$name" --repo "$REPO"
  echo "  ✅ Secret '${name}' set"
}

set_variable() {
  local name="$1"
  local value="$2"
  local description="$3"
  local default="$4"

  if [[ -z "$value" ]]; then
    if [[ -n "$default" ]]; then
      read -r -p "  Enter ${description} (${name}) [${default}]: " value
      value="${value:-$default}"
    else
      read -r -p "  Enter ${description} (${name}): " value
    fi
  fi

  if [[ -z "$value" ]]; then
    echo "  ⚠️  Skipping ${name} (no value provided)"
    return
  fi

  gh variable set "$name" --body "$value" --repo "$REPO"
  echo "  ✅ Variable '${name}' set to '${value}'"
}

# ---------------------------------------------------------------------------
# Register GitHub Secrets
# ---------------------------------------------------------------------------
echo ""
echo "============================================================================"
echo "  GitHub Secrets & Variables Registration"
echo "  Repository: ${REPO}"
echo "============================================================================"
echo ""
echo "──────────────────────────────────────────────────────────────────────────"
echo "  Step 1/2: Registering GitHub Secrets"
echo "──────────────────────────────────────────────────────────────────────────"
echo ""

set_secret "AZURE_CREDENTIALS"      "$AZURE_CREDENTIALS"     "Azure SP credentials JSON"
set_secret "AZURE_SUBSCRIPTION_ID"  "$SUBSCRIPTION_ID"       "Azure subscription ID"
set_secret "AZURE_RESOURCE_GROUP"   "$RESOURCE_GROUP"        "Azure resource group name"
set_secret "OPENCODE_GO_API_KEY"    "$OPENCODE_API_KEY"      "OpenCode Go API key"
set_secret "COSMOSDB_KEY"           "$COSMOSDB_KEY"          "CosmosDB access key"

echo ""
echo "──────────────────────────────────────────────────────────────────────────"
echo "  Step 2/2: Registering GitHub Variables"
echo "──────────────────────────────────────────────────────────────────────────"
echo ""

set_variable "AZURE_LOCATION"       "$LOCATION"          "Azure region"           "japaneast"
set_variable "APP_SERVICE_NAME"     "$APP_SERVICE_NAME"  "App Service name"       ""
set_variable "STATIC_WEB_APP_NAME"  "$SWA_NAME"          "Static Web App name"    ""

echo ""
echo "============================================================================"
echo "  ✅ All secrets and variables registered!"
echo "============================================================================"
echo ""
echo "  Next step: Verify the setup by triggering the CI workflow:"
echo "    gh workflow run ci.yml --repo ${REPO}"
echo ""
