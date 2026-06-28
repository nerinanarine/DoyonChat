# Tasks: OpenCode Go Chat Web App

**Input**: Design documents from `/specs/001-chat-app/`

**Prerequisites**: plan.md (required), spec.md (required for user stories)

**Tests**: Tests included for critical paths.

## Phase 1: Setup + IaC Foundation (Shared Infrastructure)

**Purpose**: Project initialization, basic structure, and IaC foundation

- [ ] T001 Create project structure per implementation plan
- [ ] T002 Initialize backend (Node.js + Express + TypeScript) with package.json and tsconfig
- [ ] T003 Initialize frontend (React + Vite + TypeScript) with package.json and tsconfig
- [ ] T004 [P] Configure Tailwind CSS in frontend
- [ ] T005 [P] Configure backend linting (ESLint) and formatting (Prettier)
- [ ] T006 [P] Configure frontend linting (ESLint) and formatting (Prettier)
- [ ] T007 Create `.env.example` files for both frontend and backend
- [ ] T008 Add `.gitignore` for both frontend and backend
- [ ] T086 [P] Create `infra/modules/cosmosdb.bicep` — CosmosDB account + database + containers
- [ ] T087 [P] Create `infra/modules/appService.bicep` — App Service Plan + Web App
- [ ] T088 [P] Create `infra/modules/staticWebApp.bicep` — Static Web App
- [ ] T089 [P] Create `infra/modules/keyVault.bicep` — Key Vault for secrets
- [ ] T090 [P] Create `infra/modules/appInsights.bicep` — Application Insights
- [ ] T091 [P] Create `infra/modules/monitor.bicep` — Log Analytics Workspace
- [ ] T092 [P] Create `infra/main.bicep` — Root orchestration module
- [ ] T093 [P] Create `infra/parameters/dev.parameters.json` — Dev environment parameters
- [ ] T094 [P] Create `.github/workflows/ci.yml` — PR CI pipeline (lint + unit test + Iac validate)
- [ ] T095 [P] Create `.github/workflows/deploy.yml` — Deploy pipeline (test → infra → app → smoke test)

---

## Phase 2: Foundational + Tests + IaC Deploy (Blocking Prerequisites)

**Purpose**: Core infrastructure, initial tests, and first IaC deployment

### Foundational Implementation
- [ ] T009 Setup CosmosDB connection in backend (`backend/src/db/index.ts` with @azure/cosmos)
- [ ] T010 Create CosmosDB container initialization script in `backend/src/db/init.ts`
- [ ] T011 Implement TypeScript types in `backend/src/types/index.ts` (Conversation, Message, ModelInfo)
- [ ] T012 Implement OpenCode Go API service in `backend/src/services/opencodeGo.ts` (non-streaming health check)
- [ ] T013 Setup Express app with middleware (CORS, JSON parsing, error handling) in `backend/src/app.ts`
- [ ] T014 Setup API client in frontend (`frontend/src/services/api.ts`) with fetch wrapper
- [ ] T015 Create frontend TypeScript types in `frontend/src/types/index.ts`

### Unit Tests (Phase 2)
- [ ] T096 [P] Backend unit test: CosmosDB client wrapper in `backend/tests/unit/db.test.ts`
- [ ] T097 [P] Backend unit test: OpenCode Go API service (health check) in `backend/tests/unit/opencodeGo.test.ts`
- [ ] T098 [P] Backend unit test: Error handler middleware in `backend/tests/unit/errorHandler.test.ts`
- [ ] T099 [P] Frontend unit test: API client wrapper in `frontend/tests/unit/api.test.ts`

### Integration Tests (Phase 2)
- [ ] T100 [P] Backend integration test: GET /api/health returns 200 in `backend/tests/integration/health.test.ts`
- [ ] T101 [P] Backend integration test: CosmosDB connectivity (create + read + delete document) in `backend/tests/integration/db.test.ts`

### IaC Deploy (Phase 2)
- [ ] T102 [P] Deploy dev environment via Bicep (`az deployment group create` with dev parameters)
- [ ] T103 [P] Configure Key Vault secrets (CosmosDB key, OpenCode Go API key)
- [ ] T104 [P] Seed CosmosDB containers with init script on dev environment

**Checkpoint**: Foundation ready + dev environment deployed + CI pipeline running

---

## Phase 3: User Story 1 - テキストチャットとストリーミング応答 (Priority: P1) 🎯 MVP

**Goal**: ユーザーがテキストを入力し、AIからのストリーミング応答をリアルタイムに受け取れる

**Independent Test**: フロントエンドからメッセージを送信し、SSEストリーミングで応答が表示される

### Tests for User Story 1

- [ ] T016 [P] [US1] Backend unit test: OpenCode Go API SSE streaming response parsing in `backend/tests/unit/opencodeGo.test.ts`
- [ ] T017 [P] [US1] Backend integration test: POST /api/chat returns SSE stream in `backend/tests/integration/chat.test.ts`

### Implementation for User Story 1

- [ ] T018 [US1] Implement `backend/src/services/opencodeGo.ts` streaming function (SSE parser)
- [ ] T019 [US1] Implement `backend/src/routes/chat.ts` POST /api/chat endpoint with SSE streaming
- [ ] T020 [US1] Create `frontend/src/services/chatApi.ts` with streaming fetch (EventSource/fetch with ReadableStream)
- [ ] T021 [US1] Create `frontend/src/hooks/useStreaming.ts` for managing SSE stream state
- [ ] T022 [US1] Create `frontend/src/components/Chat/ChatInput.tsx` - text input with send button
- [ ] T023 [US1] Create `frontend/src/components/Chat/ChatMessage.tsx` - single message display
- [ ] T024 [US1] Create `frontend/src/components/Chat/ChatMessageList.tsx` - message list container
- [ ] T025 [US1] Create `frontend/src/components/Chat/StreamingMessage.tsx` - streaming indicator and partial text
- [ ] T026 [US1] Wire up `frontend/src/App.tsx` with basic chat layout
- [ ] T027 [US1] Add "stop" button to interrupt streaming

**Checkpoint**: User Story 1 fully functional - can send text and receive streaming response

---

## Phase 4: User Story 2 - 複数会話の管理と履歴保持 (Priority: P1) 🎯 MVP

**Goal**: 複数会話の作成、一覧、切り替え、削除。データベース永続化。

**Independent Test**: APIで会話を作成・取得・削除し、ページリロード後も復元される

### Tests for User Story 2

- [ ] T028 [P] [US2] Backend integration test: Conversation CRUD endpoints in `backend/tests/integration/conversations.test.ts`

### Implementation for User Story 2

- [ ] T029 [US2] Implement `backend/src/models/Conversation.ts` and `backend/src/models/Message.ts` (data access layer)
- [ ] T030 [US2] Implement `backend/src/services/conversationService.ts` (CRUD operations)
- [ ] T031 [US2] Implement `backend/src/routes/conversations.ts` - GET /api/conversations, POST /api/conversations, GET /api/conversations/:id, DELETE /api/conversations/:id
- [ ] T032 [US2] Update `backend/src/routes/chat.ts` to save messages to DB and associate with conversation
- [ ] T033 [US2] Create `frontend/src/services/conversationApi.ts` for conversation API calls
- [ ] T034 [US2] Create `frontend/src/hooks/useConversations.ts` for conversation state management
- [ ] T035 [US2] Create `frontend/src/components/Sidebar/ConversationList.tsx` - list of conversations
- [ ] T036 [US2] Create `frontend/src/components/Sidebar/ConversationItem.tsx` - single conversation item with title and delete button
- [ ] T037 [US2] Create `frontend/src/components/Sidebar/NewChatButton.tsx`
- [ ] T038 [US2] Create `frontend/src/components/Layout/AppLayout.tsx` with sidebar + chat area
- [ ] T039 [US2] Wire up conversation switching in `frontend/src/App.tsx`
- [ ] T040 [US2] Auto-generate conversation title from first user message (call API to generate or use first 30 chars)

**Checkpoint**: User Stories 1 and 2 both work independently - can manage multiple conversations

---

## Phase 5: User Story 3 - Markdownとコードブロックのレンダリング (Priority: P2)

**Goal**: AI応答のMarkdownを適切にレンダリング。コードブロックにシンタックスハイライトとコピーボタン。

**Independent Test**: 静的Markdownテキストを渡して正しくレンダリングされる

### Tests for User Story 3

- [ ] T041 [P] [US3] Frontend unit test: MarkdownRenderer component renders headings and lists in `frontend/tests/unit/MarkdownRenderer.test.tsx`

### Implementation for User Story 3

- [ ] T042 [US3] Install `react-markdown` and `remark-gfm` in frontend
- [ ] T043 [US3] Install `react-syntax-highlighter` in frontend
- [ ] T044 [US3] Create `frontend/src/components/Markdown/MarkdownRenderer.tsx` with react-markdown
- [ ] T045 [US3] Create `frontend/src/components/Markdown/CodeBlock.tsx` with syntax highlighting and copy button
- [ ] T046 [US3] Update `ChatMessage.tsx` to use MarkdownRenderer for assistant messages
- [ ] T047 [US3] Add copy-to-clipboard functionality with visual feedback (toast or checkmark icon)

**Checkpoint**: Markdown rendering works with syntax highlighting and copy button

---

## Phase 6: User Story 4 - 画像入力（マルチモーダル）(Priority: P2)

**Goal**: 画像をアップロードしてマルチモーダルメッセージを送信。Base64エンコード。

**Independent Test**: 画像をアップロードし、APIに正しい形式で送信される

### Tests for User Story 6

- [ ] T048 [P] [US4] Backend unit test: image message formatting for OpenCode Go API in `backend/tests/unit/imageFormat.test.ts`

### Implementation for User Story 4

- [ ] T049 [US4] Update `backend/src/services/opencodeGo.ts` to support multimodal messages (image_url format)
- [ ] T050 [US4] Update `backend/src/routes/chat.ts` to accept imageBase64 in request body
- [ ] T051 [US4] Update `backend/src/models/Message.ts` to store image_url
- [ ] T052 [US4] Create `frontend/src/utils/image.ts` for image resizing and Base64 conversion (max 5MB)
- [ ] T053 [US4] Update `frontend/src/components/Chat/ChatInput.tsx` with image upload (drag & drop + file picker)
- [ ] T054 [US4] Add image preview in chat input before sending
- [ ] T055 [US4] Update `ChatMessage.tsx` to display image thumbnails
- [ ] T056 [US4] Update `frontend/src/services/chatApi.ts` to send image data

**Checkpoint**: Image upload and multimodal chat works

---

## Phase 7: User Story 5 - レスポンシブデザイン（モバイル対応）(Priority: P2)

**Goal**: デスクトップ、タブレット、モバイルで適切に表示。サイドバーはハンバーガーメニュー化。

**Independent Test**: ブラウザ開発者ツールで各画面サイズをシミュレートしレイアウト確認

### Implementation for User Story 5

- [ ] T057 [US5] Create `frontend/src/hooks/useMediaQuery.ts` for responsive breakpoints
- [ ] T058 [US5] Create `frontend/src/components/Layout/Header.tsx` with hamburger menu button
- [ ] T059 [US5] Create `frontend/src/components/Layout/MobileMenu.tsx` - slide-out sidebar for mobile
- [ ] T060 [US5] Update `AppLayout.tsx` with responsive grid/flex layout
- [ ] T061 [US5] Update `ChatInput.tsx` for mobile-friendly sizing (larger tap targets)
- [ ] T062 [US5] Update `ChatMessageList.tsx` with mobile padding adjustments
- [ ] T063 [US5] Test on 320px, 768px, 1024px, 1440px breakpoints

**Checkpoint**: App is fully responsive on all screen sizes

---

## Phase 8: User Story 6 - モデル切り替え (Priority: P2)

**Goal**: 会話ごとにOpenCode Goのモデルを選択・切り替えできる

**Independent Test**: モデル選択UIからモデルを変更し、APIリクエストに正しいmodelパラメータが含まれる

### Tests for User Story 6

- [ ] T074 [P] [US6] Backend unit test: model list endpoint returns correct models in `backend/tests/unit/models.test.ts`

### Implementation for User Story 6

- [ ] T075 [US6] Create `backend/src/config/models.ts` with OpenCode Go model definitions
- [ ] T076 [US6] Implement `backend/src/routes/models.ts` GET /api/models endpoint
- [ ] T077 [US6] Update `backend/src/routes/conversations.ts` PUT /api/conversations/:id/model endpoint
- [ ] T078 [US6] Update `backend/src/services/conversationService.ts` to handle model field in CRUD
- [ ] T079 [US6] Update `backend/src/routes/chat.ts` to use conversation's selected model
- [ ] T080 [US6] Create `frontend/src/services/modelApi.ts` for model list API calls
- [ ] T081 [US6] Create `frontend/src/components/Model/ModelSelector.tsx` - dropdown with model info
- [ ] T082 [US6] Create `frontend/src/components/Model/ModelInfoBadge.tsx` - displays model capability badges
- [ ] T083 [US6] Update `frontend/src/hooks/useConversations.ts` to handle model switching
- [ ] T084 [US6] Update `AppLayout.tsx` or `Header.tsx` to include ModelSelector
- [ ] T085 [US6] Add model validation: warn when image is uploaded with non-multimodal model

**Checkpoint**: Model switching works per conversation

---

## Phase 9: IaC Staging/Prod + Deploy + Tests + Monitoring

**Purpose**: Full environment deployment, comprehensive testing, and observability

### UX Polish
- [ ] T064 [P] Add loading states and skeletons for better UX
- [ ] T065 [P] Add error handling UI (toast notifications for API errors)
- [ ] T066 [P] Add empty states (no conversations, welcome screen)

### IaC — Staging & Production
- [ ] T105 [P] Create `infra/parameters/staging.parameters.json` — Staging environment parameters
- [ ] T106 [P] Create `infra/parameters/prod.parameters.json` — Production environment parameters
- [ ] T107 [P] Update `main.bicep` to support environment parameter injection (tags, SKUs, regions)
- [ ] T108 [P] Create `infra/scripts/deploy.sh` — Unified deployment script (accepts env: dev/staging/prod)
- [ ] T109 [P] Create `infra/scripts/validate.sh` — Bicep lint + what-if validation
- [ ] T110 [P] Deploy staging environment via Bicep
- [ ] T111 [P] Deploy production environment via Bicep
- [ ] T112 [P] Configure Key Vault secrets for staging and production
- [ ] T113 [P] Set up Azure RBAC (managed identity for App Service → Key Vault + CosmosDB)

### CI/CD Pipeline
- [ ] T114 [P] Configure GitHub Actions environment protection rules (staging → prod approval)
- [ ] T115 [P] Add deployment gates: smoke tests must pass before prod promotion
- [ ] T116 [P] Add Bicep what-if step to deploy pipeline for change visibility
- [ ] T117 [P] Configure GitHub Actions secrets (AZURE_CREDENTIALS, COSMOSDB_KEY, etc.)

### E2E Tests (Critical Paths)
- [ ] T118 [P] E2E test: Basic chat flow (send message → receive streaming response) in `frontend/tests/e2e/chat.spec.ts`
- [ ] T119 [P] E2E test: Create new conversation → switch → delete in `frontend/tests/e2e/conversations.spec.ts`
- [ ] T120 [P] E2E test: Markdown rendering + code block copy in `frontend/tests/e2e/markdown.spec.ts`
- [ ] T121 [P] E2E test: Image upload + multimodal chat in `frontend/tests/e2e/multimodal.spec.ts`
- [ ] T122 [P] E2E test: Model switching in `frontend/tests/e2e/model-switch.spec.ts`
- [ ] T123 [P] E2E test: Mobile responsive layout in `frontend/tests/e2e/mobile.spec.ts`
- [ ] T124 [P] E2E test: Page reload persistence (conversations + messages) in `frontend/tests/e2e/persistence.spec.ts`

### Smoke Tests (Post-Deploy)
- [ ] T125 [P] Backend smoke test: `/api/health` returns 200 on deployed environment
- [ ] T126 [P] Backend smoke test: `/api/models` returns model list on deployed environment
- [ ] T127 [P] Frontend smoke test: SPA loads without JS errors on deployed Static Web App
- [ ] T128 [P] Integration smoke test: Full chat round-trip (POST /api/chat → SSE response) on deployed environment

### Monitoring & Observability
- [ ] T129 [P] Configure Application Insights for backend (request telemetry, exceptions)
- [ ] T130 [P] Configure Application Insights for frontend (page views, client errors)
- [ ] T131 [P] Create Log Analytics queries for common troubleshooting (error rate, latency, failed requests)
- [ ] T132 [P] Set up Azure Monitor alerts (API error rate > 5%, p95 latency > 5s, CosmosDB 429 errors)
- [ ] T133 [P] Add structured logging (JSON format) to backend

### Documentation
- [ ] T134 [P] Write `README.md` with architecture diagram, tech stack, and badges
- [ ] T135 [P] Write `docs/ops-runbook.md` — incident response, rollback procedures, log queries
- [ ] T136 [P] Write `docs/iac-guide.md` — Bicep module reference, environment setup
- [ ] T137 [P] Update `quickstart.md` with CosmosDB Emulator troubleshooting
- [ ] T138 [P] Add API documentation (OpenAPI/Swagger) at `/api/docs`

### Security & Compliance
- [ ] T139 [P] Run `npm audit` in both frontend and backend; fix or document all high/critical issues
- [ ] T140 [P] Configure CORS strictly (allow only SWA origin)
- [ ] T141 [P] Add rate limiting middleware (Express) — 100 req/min per IP
- [ ] T142 [P] Add request size limit (10MB) to prevent abuse
- [ ] T143 [P] Enable Azure Security Center recommendations

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-8)**: All depend on Foundational phase completion
  - US1 (P1) and US2 (P1) can be done in parallel after Phase 2
  - US3, US4, US5, US6 (P2) can be done in parallel after Phase 2
  - Sequential order recommended: US1 → US2 → US3 → US4 → US5 → US6
- **Polish (Phase 9)**: Depends on all user stories. Includes IaC staging/prod, full E2E suite, monitoring, security, and documentation.

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 2. No dependencies on other stories.
- **US2 (P1)**: Can start after Phase 2. Integrates with US1 (chat messages need conversation context).
- **US3 (P2)**: Can start after Phase 2. Integrates with US1 (message rendering).
- **US4 (P2)**: Can start after Phase 2. Integrates with US1 (chat input).
- **US5 (P2)**: Can start after Phase 2. Integrates with all UI components.
- **US6 (P2)**: Can start after Phase 2. Integrates with US2 (conversation model field) and US4 (multimodal model validation).

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Backend models before services, services before routes
- Frontend hooks/services before components
- Core implementation before integration
- Story complete before moving to next priority

## Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel
- Backend and frontend work within a user story can be parallelized
- US3 (Markdown), US4 (Images), US5 (Responsive), US6 (Model Switching) can be worked on in parallel after US1+US2

## Implementation Strategy

### MVP First (US1 + US2)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. Complete Phase 4: User Story 2
5. **STOP and VALIDATE**: Test core chat + conversation management
6. Deploy to Azure if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 → Test independently → Deploy/Demo (basic chat works!)
3. Add US2 → Test independently → Deploy/Demo (multiple conversations!)
4. Add US3 → Test independently → Deploy/Demo (pretty rendering!)
5. Add US4 → Test independently → Deploy/Demo (images!)
6. Add US5 → Test independently → Deploy/Demo (mobile!)
7. Add US6 → Test independently → Deploy/Demo (model switching!)
8. Polish → Deploy final MVP
