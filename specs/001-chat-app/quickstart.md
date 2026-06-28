# Quickstart: OpenCode Go Chat Web App

## Prerequisites

- Node.js 20+ (LTS)
- Azure CosmosDB Emulator (local) or Azure CosmosDB account (cloud)
- OpenCode Go API key ([https://opencode.ai/docs/go/](https://opencode.ai/docs/go/))
- Azure CLI (optional, for deployment)

## Local Setup

### 1. Clone and Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Setup CosmosDB

**Option A: Azure CosmosDB Emulator (local)**
```bash
# Download and install from Microsoft
# https://docs.microsoft.com/en-us/azure/cosmos-db/local-emulator

# Start emulator (default endpoint)
# https://localhost:8081/
# Key: C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==
```

**Option B: Azure CosmosDB (cloud)**
```bash
# Create via Azure Portal or CLI
az cosmosdb create --name <account-name> --resource-group <rg> --locations regionName=japaneast
```

**Initialize containers**
```bash
cd backend
npm run db:init
```

### 3. Configure Environment Variables

```bash
# Backend
cp backend/.env.example backend/.env

# Edit backend/.env
COSMOSDB_ENDPOINT=https://localhost:8081/
COSMOSDB_KEY=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==
COSMOSDB_DATABASE=chatdb
OPENCODE_GO_API_KEY=sk-opencode-your-key-here
OPENCODE_GO_MODEL=kimi-k2.6
OPENCODE_GO_MODEL=kimi-k2.6
PORT=3000
FRONTEND_URL=http://localhost:5173
```

```bash
# Frontend
cp frontend/.env.example frontend/.env

# Edit frontend/.env
VITE_API_URL=http://localhost:3000/api
```

### 4. Run Development Servers

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3000

### 5. Run Tests

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test

# E2E tests
cd frontend
npx playwright test
```

## Azure Deployment

### Prerequisites

- Azure CLI logged in (`az login`)
- Azure subscription

### Deploy with Bicep

```bash
# Validate
az bicep build --file infra/main.bicep

# Deploy dev environment
cd infra
az deployment group create \
  --resource-group rg-opencode-chat-dev \
  --template-file main.bicep \
  --parameters parameters/dev.parameters.json

# Deploy staging environment
az deployment group create \
  --resource-group rg-opencode-chat-staging \
  --template-file main.bicep \
  --parameters parameters/staging.parameters.json

# Deploy production environment
az deployment group create \
  --resource-group rg-opencode-chat-prod \
  --template-file main.bicep \
  --parameters parameters/prod.parameters.json
```

### Deploy with Script

```bash
# Deploy any environment
./infra/scripts/deploy.sh dev
./infra/scripts/deploy.sh staging
./infra/scripts/deploy.sh prod
```

### Deploy with GitHub Actions

Push to `main` branch triggers CI/CD pipeline:

1. **CI** (on PR): lint → unit test → integration test → Iac validate
2. **Deploy** (on merge to `main`): test → deploy infra to staging → deploy app → smoke test → manual approval → deploy to prod

### Run Tests

```bash
# Unit tests (backend)
cd backend
npm run test:unit

# Unit tests (frontend)
cd frontend
npm run test:unit

# Integration tests (requires CosmosDB Emulator or real account)
cd backend
npm run test:integration

# E2E tests (requires dev servers running)
cd frontend
npm run test:e2e

# E2E tests (headed mode for debugging)
cd frontend
npm run test:e2e:ui

# All tests
cd backend && npm test
cd frontend && npm test
```

### Test Coverage

```bash
# Generate coverage reports
cd backend
npm run test:coverage

cd frontend
npm run test:coverage
```

## Environment Variables Reference

### Backend

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | Yes | Server port (default: 3000) |
| `COSMOSDB_ENDPOINT` | Yes | CosmosDB endpoint URL |
| `COSMOSDB_KEY` | Yes | CosmosDB primary key |
| `COSMOSDB_DATABASE` | Yes | CosmosDB database name |
| `OPENCODE_GO_API_KEY` | Yes | OpenCode Go API key |
| `OPENCODE_GO_MODEL` | No | Default model (default: kimi-k2.6) |
| `MODEL_LIST` | No | Comma-separated list of enabled models |
| `FRONTEND_URL` | Yes | CORS allowed origin |

### Frontend

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Yes | Backend API base URL |
| `VITE_APPINSIGHTS_CONNECTION_STRING` | No | Application Insights connection string |

### CI/CD (GitHub Actions Secrets)

| Secret | Required | Description |
|----------|----------|-------------|
| `AZURE_CREDENTIALS` | Yes | Service principal JSON for Azure login |
| `OPENCODE_GO_API_KEY` | Yes | OpenCode Go API key |
| `COSMOSDB_KEY` | Yes | CosmosDB primary key (for dev/staging) |
| `APPINSIGHTS_INSTRUMENTATION_KEY` | No | Application Insights key |
