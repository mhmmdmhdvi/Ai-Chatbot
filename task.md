# AI Customer Assistant — Development Roadmap

## Document purpose

This file is the working implementation plan for the AI Customer Assistant project. Keep it updated as decisions are made and phases are completed.

Planning status: **Phase 5/6 RAG is live — verified S, C, and SF knowledge is in production; the reviewed general catalog is next**

The OpenAI adapter and live VPS connectivity test are complete. External AI calls remain disabled on the Tehran development machine; embeddings and production chat run only from the supported production environment described by the owner.

---

## Fixed project decisions

These decisions are requirements unless the project owner explicitly changes them later:

- [x] The entire customer-facing website is in Persian (Farsi).
- [x] The chatbot speaks and responds in Persian (Farsi).
- [x] The customer interface uses a right-to-left layout.
- [x] English is not a required interface language for the first version.
- [x] Embedded English product names, model numbers, URLs, and technical codes must display correctly inside Persian content.
- [x] Frontend stack: React.js and Tailwind CSS.
- [x] Backend stack: Django and Django REST Framework.
- [x] Database: PostgreSQL, with pgvector if approved for document retrieval.
- [x] Development and deployment: Docker and Docker Compose.
- [x] WSL 2 and Docker Desktop are installed on the development computer.
- [x] The live application requires login before the chatbot can be opened.
- [x] There is no public registration page or registration API.
- [x] Application users are created and managed through Django Admin.
- [x] The chatbot login uses a normal non-admin user, not the Django superuser.
- [x] Authentication uses Django's server-side session system and secure cookies.
- [x] Login is an owner/operator gate that protects the live website and AI API usage.
- [x] Customers do not receive accounts and do not see the login credentials.
- [x] After the kiosk is authenticated, the assistant asks each customer for a name and phone number inside the conversation before accepting questions.
- [x] Starting a new customer session clears the previous conversation from the screen but keeps the kiosk account logged in.
- [x] Customer information and complete conversations are stored in PostgreSQL and displayed in the protected Django Admin.

Supporting components such as Nginx, Gunicorn, and pgvector complement this stack; they do not replace it.

---

## Product goal

Build a professional Persian customer assistant that runs as a web application and can later operate on a Windows touchscreen kiosk.

The first version will:

- Require the owner/operator to pass a Persian login gate before the protected kiosk application opens.
- Collect the customer's name and phone number through a structured form.
- Start a new conversation for each visit.
- Answer questions using approved company documents.
- Provide a Persian right-to-left interface and Persian chatbot responses.
- Support natural Persian follow-up questions.
- Prefer concise, friendly, professional answers.
- Refuse to guess when the available company information does not support an answer.
- Save customers, conversations, messages, sources, timestamps, and AI usage in PostgreSQL.
- Protect personally identifiable information and API secrets.
- Run through Docker Compose in development and production.

---

## Confirmed kiosk flow

```text
Owner/operator opens the live website on the touchscreen
        |
        v
Persian login page
        |
        | Django validates the normal kiosk/chat account
        v
Protected conversation screen
        |
        | Assistant asks for customer name, then phone number
        v
Create Customer + Conversation in PostgreSQL
        |
        v
Persian chatbot
        |
        | Save every customer and assistant message
        v
Start new customer
        |
        | Close/reset the customer conversation only
        v
Return to name/phone form while kiosk remains authenticated

Separate administrator flow:
Django Admin login -> Customers -> Conversations -> Messages/usage
```

The application login protects access to the website and paid AI API. It is separate from the customer's name and phone collection. Customer information and conversations are stored in PostgreSQL; Django Admin is the protected interface used to view them.

---

## Package and installation responsibility

### User/system-level setup

- [x] Confirm that hardware virtualization is enabled sufficiently for WSL 2/Docker.
- [x] Install WSL 2 on Windows.
- [x] Install Docker Desktop.
- [x] Restart Windows if required.
- [ ] Confirm Docker Desktop licensing is acceptable for the company.
- [ ] Provide an eligible AI provider account and API key when AI integration begins.
- [ ] Provide representative company documents.
- [x] Provide the production Ubuntu server and deployment access; permanent domain remains pending.

### Project dependencies handled in the repository

React, Tailwind, Django, Python packages, PostgreSQL, pgvector, Nginx, test tools, and other project dependencies will be declared in project files and installed inside Docker images. Do not install these globally for this project.

Current host environment verified on 2026-08-10:

- Node.js 24.18.0 installed.
- npm 11.16.0 installed.
- Python 3.14.6 installed.
- Git 2.55.0 installed.
- WSL 2 installed and running with the `docker-desktop` distribution.
- Docker Desktop Engine 29.6.2 installed and running.
- Docker Compose 5.3.1 installed and responding.

---

## Important Phase 0 boundary — AI provider eligibility

The intended operating country, customer location, server location, account eligibility, and provider terms must be confirmed before OpenAI becomes a production dependency.

The official OpenAI supported-countries page currently does not list Iran and warns that accessing or offering access outside listed territories can lead to account blocking or suspension:

https://help.openai.com/en/articles/5347006-openai-api-supported-countries-and-territories

- [ ] Confirm where the company is legally operating.
- [x] Confirm kiosk location: the owner states that customer use will be outside Iran in an OpenAI-supported country.
- [x] Confirm server location: the owner states that production hosting is in an OpenAI-supported country.
- [x] Confirm provider availability for the stated production server and kiosk locations before activation.
- [x] Do not design or deploy a VPN/location workaround.
- [ ] Select a compliant alternative provider if OpenAI is unavailable.

The backend will use a small provider interface so the rest of the application is not permanently tied to one AI vendor.

---

## Recommended architecture

```text
Windows touchscreen kiosk
        |
        | HTTPS
        v
Nginx container
|-- Serves compiled React frontend
`-- Proxies /api requests and streaming responses
        |
        v
Django + Gunicorn container
|-- Django session authentication
|-- Protected customer and conversation APIs
|-- Protected Django Admin data views
|-- AI provider adapter
|-- Streaming chat service
|-- Document ingestion
`-- Retrieval and grounding
        |
        |----------------------> Eligible AI API
        |                        |-- Text generation
        |                        `-- Embeddings
        v
PostgreSQL + pgvector
|-- Customers
|-- Conversations
|-- Messages
|-- Documents and versions
|-- Document chunks and vectors
|-- Answer sources
`-- Usage records

Persistent storage
|-- PostgreSQL Docker volume
|-- Server document directory
`-- Encrypted off-server backups
```

### Development containers

- `frontend`: Vite development server with hot reload.
- `backend`: Django development server with debugging.
- `database`: PostgreSQL with pgvector.

### Production containers

- `nginx`: HTTPS reverse proxy and compiled React static files.
- `backend`: Django running under Gunicorn.
- `database`: PostgreSQL with pgvector and persistent storage.

The production environment does not require a continuously running Node frontend container.

---

## Recommended project structure

```text
AI Chatbot/
|-- frontend/
|   |-- src/
|   |   |-- components/
|   |   |-- features/auth/
|   |   |-- features/chat/
|   |   |-- features/customer/
|   |   |-- hooks/
|   |   |-- services/
|   |   `-- styles/
|   |-- package.json
|   `-- Dockerfile
|-- backend/
|   |-- config/
|   |-- apps/
|   |   |-- chat/
|   |   `-- knowledge/
|   |-- services/
|   |   `-- ai/
|   |-- tests/
|   |-- requirements/
|   `-- Dockerfile
|-- infra/
|   `-- nginx/
|-- scripts/
|   |-- backup/
|   |-- restore/
|   `-- deploy/
|-- docs/
|-- compose.yaml
|-- compose.dev.yaml
|-- compose.prod.yaml
|-- .env.example
|-- .gitignore
|-- .dockerignore
`-- task.md
```

---

# Development phases

## Phase 0 — Requirements, compliance, and architecture

Difficulty: **4/10**
Estimated time: **2–4 working days**

### Goal

Confirm the business rules, privacy requirements, AI provider, document quality, and measurable acceptance criteria before implementation.

### Why

Provider eligibility, customer privacy, document quality, and expected answer behavior can materially change the architecture.

### Tasks

- [ ] Resolve the AI provider eligibility questions above.
- [ ] Define the first release's exact scope and exclusions.
- [x] Define the initial supported phone-number country as Iran and normalize valid numbers to E.164.
- [x] Define the first version's customer-facing language as Persian.
- [x] Define login as mandatory and public registration as unavailable.
- [x] Define login as an owner/operator kiosk gate, not a customer account system.
- [x] Define the post-login flow as customer name/phone intake followed by chat.
- [x] Define new-customer reset as preserving the authenticated kiosk session.
- [x] Define PostgreSQL as storage and Django Admin as the management/viewing interface for customer and conversation data.
- [ ] Decide the kiosk/application login session duration.
- [ ] Decide who holds the chatbot-user password and when staff should log out.
- [ ] Decide how production Django Admin access will be restricted.
- [ ] Decide whether name and phone collection requires explicit consent.
- [ ] Define customer/conversation retention and deletion periods.
- [ ] Define who may access customer and conversation data.
- [ ] Define the staff-contact fallback shown for unknown answers.
- [ ] Decide whether customers should see source document names.
- [ ] Collect representative PDF, DOCX, and TXT documents.
- [ ] Identify scanned PDFs that require OCR.
- [ ] Identify conflicting, outdated, or duplicated documents.
- [ ] Create 50–100 evaluation questions in Persian, including realistic mixed Persian/English product names and model numbers.
- [ ] Include known-answer, unknown-answer, ambiguous, and adversarial questions.
- [ ] Agree on response quality, latency, groundedness, and refusal targets.
- [ ] Record architecture decisions in `docs/`.

### Files/architecture

- `docs/requirements.md`
- `docs/architecture.md`
- `docs/data-retention.md`
- `docs/threat-model.md`
- `docs/evaluation-set.md` or a structured equivalent

### Dependencies

None.

### Database changes

Draft the schema only. Do not create migrations yet.

### API endpoints

Draft the endpoint contract only.

### AI considerations

- Confirm the eligible provider.
- Define an `AIProvider` interface.
- Plan to evaluate model quality rather than choosing only by price.
- Do not promise that hallucination can be eliminated absolutely.

### Security considerations

- Define consent, retention, deletion, access, backup, and incident requirements.
- Establish that a phone number is not authentication.

### Testing

Review the evaluation set and acceptance criteria with business stakeholders.

### Definition of Done

- [ ] AI provider path is legally and operationally approved.
- [ ] Data rules and initial scope are approved.
- [ ] Representative documents and evaluation questions exist.
- [ ] Architecture and acceptance criteria are agreed.

---

## Phase 1 — Docker-first project setup

Difficulty: **4/10**
Estimated time: **2–3 working days**

### Goal

Create a reproducible development environment and initial repository structure.

### Why

All developers and production deployments should use controlled versions and equivalent services.

### Tasks

- [x] Verify WSL 2, Docker, and Docker Compose.
- [x] Initialize Git without committing secrets.
- [x] Create the frontend and backend directories.
- [x] Add base, development, and production Compose files.
- [x] Add separate frontend and backend Dockerfiles.
- [x] Add `.env.example`, `.gitignore`, and `.dockerignore`.
- [x] Add PostgreSQL with pgvector and a persistent volume.
- [x] Create a minimal custom Django user model based on `AbstractUser` before the first migration.
- [x] Configure Django session authentication and password validation.
- [x] Add development hot reload for React and Django.
- [x] Add service health checks.
- [x] Add a basic Nginx configuration skeleton.
- [x] Pin dependency versions and commit lock files.

### Files/architecture

- `compose.yaml`
- `compose.dev.yaml`
- `compose.prod.yaml`
- `frontend/Dockerfile`
- `backend/Dockerfile`
- `infra/nginx/`
- `.env.example`

### Dependencies

- React and Vite
- Tailwind CSS
- Django and Django REST Framework
- PostgreSQL and pgvector
- PostgreSQL Python driver
- Gunicorn
- Frontend and backend test runners

### Database changes

- Create the initial database.
- Enable the pgvector extension.
- Create the initial custom user/authentication tables.

### API endpoints

- `GET /api/v1/health`

### AI considerations

Define environment variables and the provider interface, but do not make paid AI calls.

### Security considerations

- No secrets in Git.
- Fail startup when required production variables are missing.
- Use non-root containers where practical.
- Do not expose PostgreSQL publicly.

### Testing

- Build every image.
- Start the stack.
- Verify hot reload.
- Verify health checks and container networking.
- Verify PostgreSQL data survives normal container recreation.

### Definition of Done

- [x] One documented command starts the development stack.
- [x] Frontend, backend, and database communicate correctly.
- [x] Hot reload and health checks work.
- [x] Recreating the database container does not delete its volume.

Phase 1 verification completed on 2026-08-09:

- Backend Django system check: passed.
- Backend test suite: passed.
- Frontend test suite: passed.
- Frontend production build: passed.
- Backend and Nginx production image builds: passed.
- Live backend health endpoint: passed.
- Live Persian RTL frontend response: passed.
- PostgreSQL container recreation retained all 20 applied migrations.
- pgvector remained enabled after recreation (`0.8.6`).

---

## Phase 2 — Authentication, customer, and conversation backend

Difficulty: **6/10**
Estimated time: **4–6 working days**

### Goal

Implement protected login, structured customer intake, and persistent conversation storage without relying on the LLM.

### Why

The live chatbot must not be publicly accessible, while customer names, phone numbers, and message history require deterministic validation and storage.

### Tasks

- [x] Add a Persian login endpoint backed by Django authentication.
- [x] Add logout and current-user endpoints.
- [x] Do not add a registration endpoint.
- [x] Create a separate Django superuser for administration.
- [x] Create one normal active chatbot user through Django Admin.
- [x] Ensure the chatbot user is not staff and is not a superuser.
- [x] Require authentication for all customer, conversation, and message endpoints; apply the same default to future AI endpoints.
- [x] Rotate/renew the authenticated session through Django's standard login flow.
- [x] Add `Customer`, `Conversation`, and `Message` models.
- [x] Normalize and validate Iranian phone numbers on the backend.
- [x] Create a new conversation for each kiosk visit.
- [x] Use non-sequential public conversation identifiers.
- [x] Prevent phone-number-only access to historical conversations.
- [x] Record timestamps, conversation status, role, and message text.
- [x] Leave a minimal nullable field or future path for kiosk identification.
- [x] Register customers, conversations, and messages in Django Admin.
- [ ] Add AI usage records to Django Admin when the AI provider is implemented in Phase 4.
- [x] Add Django Admin search for customer name and normalized phone number.
- [x] Add conversation filters for date, status, and customer.
- [x] Make conversation messages easy to review in chronological order.
- [x] Make sensitive conversation records read-only in Django Admin unless an explicit edit/delete workflow is approved.

### Files/architecture

- `backend/apps/chat/models.py`
- `backend/apps/chat/serializers.py`
- `backend/apps/chat/views.py`
- `backend/apps/chat/urls.py`
- `backend/apps/chat/services.py`
- `backend/apps/chat/tests/`
- `backend/apps/accounts/models.py`
- `backend/apps/accounts/views.py`
- `backend/apps/accounts/urls.py`
- `backend/apps/accounts/tests/`
- `backend/apps/chat/admin.py`

### Dependencies

- Django REST Framework
- A maintained phone-number validation library
- Django's built-in authentication, session, password-hashing, and CSRF systems

### Database changes

- Customer table
- Conversation table
- Message table
- Necessary indexes and foreign keys
- User, session, and authentication tables from Phase 1
- Relationships and indexes needed for efficient Django Admin customer/conversation lookup

### API endpoints

- `GET /api/v1/auth/csrf/`
- `POST /api/v1/auth/login/`
- `POST /api/v1/auth/logout/`
- `GET /api/v1/auth/me/`
- `POST /api/v1/sessions/`
- `GET /api/v1/sessions/current/`
- `GET /api/v1/conversations/{uuid}/messages/`
- `POST /api/v1/conversations/{uuid}/messages/`
- `POST /api/v1/conversations/{uuid}/close/`

### AI considerations

Keep AI disabled until Phase 4. Store customer messages normally and return `ai_status: "disabled"`; do not make provider calls or create fake assistant answers.

### Security considerations

- Return a generic Persian error for invalid username/password combinations.
- Rate-limit login attempts and add database-backed failed-login throttling/lockout.
- Use HTTP-only, secure, same-site session cookies in production.
- Require CSRF protection for state-changing session-authenticated requests.
- Keep Django Admin credentials separate from chatbot-user credentials.
- Do not expose Django Admin broadly on the public internet.
- Ensure the normal kiosk/chat user has no Django Admin or data-management permission.
- Avoid displaying secrets or raw AI provider credentials anywhere in Django Admin.
- Server-side validation is authoritative.
- Apply input-length and request-size limits.
- Bind conversation access to a secure session.
- Do not log raw phone numbers unnecessarily.

### Testing

- Login success/failure tests
- Logout and session-expiration tests
- Authentication-required endpoint tests
- CSRF and cookie tests
- Login rate-limit/lockout tests
- Confirmation that no registration route exists
- Model and serializer tests
- Phone normalization tests
- Invalid-input tests
- Session isolation tests
- API integration tests
- Django Admin permission, search, filtering, ordering, and read-only tests

### Definition of Done

- [x] Unauthenticated visitors cannot access customer, conversation, or message APIs.
- [x] The normal chatbot user can log in and log out.
- [x] The chatbot user role cannot access Django Admin.
- [x] No public registration endpoint or page exists.
- [x] Valid customers and conversations can be created.
- [x] Invalid input is rejected safely.
- [x] Messages persist in PostgreSQL.
- [x] One customer cannot retrieve another session's messages.
- [x] The administrator can find a customer and review that customer's conversations and chronological messages in Django Admin.
- [x] The normal kiosk/chat user cannot access customer records through Django Admin.

Phase 2 backend verification completed on 2026-08-09:

- Django system check: passed.
- Database migration: applied successfully.
- Backend test suite: 21 tests passed.
- Verified CSRF enforcement, session rotation, generic Persian login errors, and database-backed login lockout.
- Verified phone validation, UUID conversation isolation, new-customer reset, message persistence, and Django Admin access separation.

---

## Phase 3 — Touchscreen React experience

Difficulty: **5/10**
Estimated time: **4–6 working days**

### Goal

Build the complete kiosk experience using the non-AI API first.

### Why

The customer flow, accessibility, and touch ergonomics can be validated independently from model behavior.

### Tasks

- [x] Build a Persian `LoginPage` with username and password fields.
- [x] Add authentication state and a protected loading/error state.
- [x] Show unauthenticated users only the login page.
- [x] Open the protected kiosk flow for authenticated users.
- [x] Keep the logo and operator logout controls off the customer-facing kiosk screen.
- [x] Build conversational name and phone intake before the full chat instead of using a separate conventional form page.
- [x] Present name and phone intake as two sequential 3D-character speech popovers, then reveal the full chat only after customer creation.
- [x] Build the chat message list and composer.
- [x] Add a full-screen gradient 3D environment with CSS-built ambient forms and a readable layered-glass chat surface.
- [x] Replace the generic assistant icon with a custom transparent 3D female concierge character.
- [x] Add large touch targets and readable typography.
- [x] Use a Persian right-to-left layout throughout the customer experience.
- [x] Correctly isolate embedded left-to-right product names, numbers, URLs, and technical codes.
- [x] Add sending, loading, error, reconnect, offline, saved-message, and empty states.
- [ ] Add the streaming state when AI streaming is implemented in Phase 4.
- [x] Add start-new-conversation and confirmation behavior.
- [x] Add a three-minute inactivity timeout with a 30-second warning that clears the customer but keeps the kiosk account logged in.
- [x] Return to the assistant's first name prompt after a manual or automatic customer reset.
- [x] Never show the previous customer's name, phone number, or messages to the next customer after reset.
- [x] Prevent accidental double submission.
- [ ] Test the Windows on-screen keyboard on the physical stand; responsive 390px and desktop viewport checks pass in software.

### Files/architecture

- `KioskShell`
- `LoginPage`
- `ProtectedRoute`
- `ConversationalIntake`
- `ChatPanel`
- `MessageList`
- `MessageBubble`
- `MessageComposer`
- `StreamingMessage`
- `ConnectionStatus`
- `IdleTimeoutDialog`

### Dependencies

- React
- Tailwind CSS
- Frontend test runner and component testing library
- No React Router or React Query yet; the kiosk is one guarded screen flow and does not need URL routing or a data-cache layer.

### Database changes

None beyond Phase 2.

### API endpoints

Consume the Phase 2 authentication, customer, and conversation endpoints.

### AI considerations

Keep AI disabled. Store customer messages without creating fake assistant answers. Intake prompts are deterministic interface messages and do not claim to be AI-generated answers.

### Security considerations

- Never store the password in browser storage.
- Keep authentication in an HTTP-only Django session cookie.
- Do not display whether a submitted username exists.
- Do not persist phone numbers in browser local storage.
- Render assistant output safely.
- Do not render arbitrary HTML from the AI.

### Testing

- Login, protected-route, expired-session, and hidden-operator-control tests
- Component tests
- Form validation tests
- Persian RTL and mixed-content visual testing
- Touch-size and responsive testing
- Session reset tests

### Definition of Done

- [x] Unauthenticated users see only the Persian login page.
- [x] Valid credentials open the protected chatbot.
- [x] Invalid credentials show a generic Persian error.
- [x] Customer-session reset does not unintentionally log out the kiosk account.
- [x] Starting a new customer returns to the first conversational intake prompt with no previous customer data visible.
- [x] Customer intake and stored-message conversation work end to end while AI is disabled.
- [x] Dimensional styling preserves high-contrast text, clear control boundaries, and flat readable message content.
- [ ] The interface is comfortable on the target touchscreen size.
- [x] Persian RTL layout and embedded left-to-right content display correctly in software viewport checks.
- [x] Old session information is cleared reliably after manual or automatic reset.

Phase 3 software verification completed on 2026-08-09:

- Six frontend interaction tests passed: login gate, generic login error, valid login flow, expired-session handling, absence of operator controls, conversational customer intake, mixed Persian/English message storage, and customer reset.
- Frontend production build passed.
- The simplified conversational-intake redesign was visually inspected at 1440 × 900.
- The redesigned narrow viewport passed at 390 × 844 with no horizontal overflow.
- The full-screen gradient environment, CSS-built 3D forms, custom assistant character, readable message layers, and floating composer were visually rechecked at both viewport sizes.
- Physical stand, touch comfort, and Windows on-screen-keyboard testing remain pending.

---

## Phase 4 — AI provider integration and streaming

Difficulty: **6/10**
Estimated time: **3–5 working days**

### Goal

Generate and stream natural answers through a replaceable server-side AI provider.

Implementation status on 2026-08-10: the provider-neutral streaming path is complete and mock-tested. OpenAI remains disabled on the Tehran development machine. The owner later clarified that the production server and customer kiosk will both be in supported countries, so the existing adapter may be enabled only in that production environment.

### Why

Streaming improves perceived latency, while a provider interface reduces vendor and regional risk.

### Tasks

- [x] Implement the `AIProvider` interface.
- [x] Add the approved production provider implementation.
- [x] Keep the OpenAI adapter disabled locally and activation-controlled by production environment settings.
- [x] Add timeout, bounded retry, cancellation, and error translation logic.
- [x] Stream response events through Django and Nginx.
- [x] Save the final assistant message after streaming.
- [x] Record token usage, latency, provider, model, and request IDs.
- [x] Keep conversation context bounded.
- [x] Add friendly failure and retry behavior.

### Files/architecture

- `backend/apps/chat/ai/base.py`
- `backend/apps/chat/ai/openai_provider.py`
- `backend/apps/chat/ai/prompts.py`
- `backend/apps/chat/ai/service.py`
- `backend/apps/chat/streaming.py`
- Streaming endpoint/service tests

### Dependencies

- Official OpenAI SDK, activated only in the owner-confirmed supported production environment
- Django streaming response support

### Database changes

- Provider/model metadata on assistant messages or a related usage table
- Input/output token counts
- Request latency and error category

### API endpoints

Upgrade the message endpoint to return a streamed response.

### AI considerations

- For OpenAI, begin evaluation with `gpt-5.6-terra` and compare `gpt-5.6-luna`.
- Use concise instructions and controlled output length.
- Use `store: false` when supported and appropriate.
- Keep PostgreSQL as the canonical conversation store.

### Security considerations

- API keys exist only in backend environment variables.
- Redact prompts, phone numbers, and secrets from logs.
- Limit request and response sizes.
- Avoid unlimited automatic retries that create duplicate cost.

### Testing

- Mocked provider tests
- Timeout and partial-stream tests
- Client disconnect tests
- Bilingual conversation tests
- Usage-recording tests

### Definition of Done

- [x] Responses stream from backend to browser.
- [x] Completed messages and usage are saved once.
- [x] Provider errors do not break the conversation UI.
- [x] No API key reaches frontend code or browser traffic.

---

## Phase 5 — Document ingestion and persistence

Difficulty: **7/10**
Estimated time: **4–7 working days**

### Goal

Convert approved documents into versioned, searchable knowledge.

### Why

Document extraction and lifecycle quality determine the reliability of the later retrieval system.

### Tasks

- [x] Add document and document-version models.
- [x] Extract approved PDF documents.
- [x] Add strict DOCX extraction for human-reviewed paragraphs and tables; TXT remains deferred until supplied.
- [x] Detect scanned/empty PDFs and run local Persian/English OCR when approved.
- [x] Normalize Persian and mixed Persian/English document text conservatively.
- [x] Chunk text while preserving document and page metadata.
- [x] Generate embeddings through the approved provider.
- [x] Save vectors in pgvector.
- [x] Detect duplicate content using checksums.
- [x] Support replace, deactivate, and rollback semantics.
- [x] Add controlled management commands for import/reindex.

### Current PDF audit — 2026-08-10

- [x] Audited all 15 supplied PDFs without writing to the database or calling OpenAI.
- [x] Confirmed all 15 PDFs are scanned/image-based and require OCR.
- [x] Processed 58 pages into 58 candidate chunks and approximately 74,000 characters.
- [x] Verified that narrative Persian text is suitable for general retrieval after normalization.
- [ ] Continue obtaining text-native originals or manually reviewing exact technical tables; OCR dropped digits in some numeric values.
- [x] Manually reviewed the Megatite S page-2 application/curing table and added it as checksum-bound verified knowledge.
- [x] Imported and activated all 15 OCR documents on the VPS (15 ready versions, 58 active chunks).
- [x] Mark OCR evidence as review-required so the model does not state unverified numbers as fact.
- [x] Add high-detail OpenAI PDF vision extraction with strict structured output and complete page transcription.
- [x] Add a second visual audit pass and compare technical numeric facts while excluding page/footer/contact numbers.
- [x] Keep uncertain or disagreeing pages in a private report and out of active knowledge.
- [x] Make extraction resumable so an embedding retry does not repeat paid vision calls.
- [x] Split large scans into checkpointed three-page batches after whole-document requests failed on the 20-page catalogs.
- [x] Validate the pipeline on all 3 pages of the Megatite S datasheet (38 numeric facts, no cross-pass disagreement).
- [x] Confirm through human comparison that agreeing vision passes can still misread a technical value; do not treat AI agreement as verification.
- [x] Add a controlled, checksum-deduplicated `import_verified_docx` command with an explicit human-review gate.
- [x] Audit the first Megatite S DOCX and identify the required `28 -> 7 days`, `bases -> steps`, and `thinner -> thinners` corrections.
- [x] Validate a temporary corrected local copy with six retrieval questions and three live Persian seller-answer tests.
- [x] Correct, re-audit, and import the Megatite S DOCX on production.
- [x] Deactivate only the old Megatite S OCR/vision source keys after the verified DOCX passes on production.
- [x] Repeat the human-reviewed DOCX workflow for Megatite C and Megatite SF, including alias and safety checks.
- [x] Audit all 20 pages of the general catalog and build a strict-import-safe reviewed DOCX that excludes ambiguous engineering tables and time-sensitive contact/certificate claims.
- [ ] Import the reviewed general catalog on production, run general and product-specific regression questions, then deactivate only the matching legacy catalog source.
- [x] Audit Megatite G, rebuild its incorrect cure tables and applications as a strict-import-safe reviewed DOCX, and add Persian G/unit-routing regression coverage.
- [ ] Import the reviewed Megatite G DOCX on production, run its acceptance questions, then deactivate only the matching legacy G source.
- [x] Render the assistant's safe bold and list formatting correctly in the Persian chat UI without interpreting customer Markdown or raw HTML.

### Files/architecture

- `backend/apps/knowledge/models.py`
- `backend/apps/knowledge/extractors/`
- `backend/apps/knowledge/chunking.py`
- `backend/apps/knowledge/repository.py`
- `backend/apps/knowledge/management/commands/import_documents.py`
- `backend/apps/knowledge/management/commands/import_verified_docx.py`
- `backend/apps/knowledge/management/commands/extract_documents_with_vision.py`
- `backend/apps/knowledge/vision_extraction.py`

### Dependencies

- PDF text extraction library
- `python-docx` for strict, text-native DOCX extraction
- pgvector integration
- Approved embedding provider

### Database changes

- Document table
- Document version/status table
- Document chunk table
- Vector column and search index

### API endpoints

No public upload endpoint in the first version. Use a controlled management command.

### AI considerations

- For eligible OpenAI use, begin with `text-embedding-3-large` for multilingual retrieval quality.
- Embeddings are created during indexing, not on every answer.

### Security considerations

- Allow only approved file types.
- Enforce size limits and safe filenames.
- Treat document text as untrusted data, not instructions.
- Store documents outside public/static directories.

### Testing

- Persian and mixed-content extraction tests
- Page/source metadata tests
- Duplicate and replacement tests
- Malformed and unsupported file tests
- Scanned-PDF detection tests

### Definition of Done

- [x] Approved files can be imported and searched.
- [x] Every chunk can be traced to a document version and location.
- [x] Replacing a document does not leave ambiguous active content.
- [ ] Documents survive container recreation and are backed up.

---

## Phase 6 — Retrieval, grounding, citations, and evaluation

Difficulty: **8/10**
Estimated time: **1–2 weeks**

### Goal

Answer from retrieved company evidence and refuse unsupported questions.

### Why

A fluent answer is not useful if it invents company prices, policies, or warranty information.

### Tasks

- [x] Embed each customer question.
- [x] Retrieve a small number of relevant chunks.
- [x] Add configurable relevance thresholds.
- [x] Preserve relevant conversational follow-up context.
- [x] Limit retrieved context and older conversation history.
- [x] Instruct the model to use company evidence only.
- [x] Instruct the model to ignore instructions found inside documents.
- [x] Return a safe insufficient-information response when evidence is weak.
- [x] Save answer-to-source relationships.
- [ ] Optionally show source document names in the UI.
- [ ] Evaluate vector-only retrieval.
- [x] Add limited product-code-aware hybrid retrieval after live evaluation showed cross-product matches.
- [ ] Compare Terra/Luna or the selected provider's models on the same evaluation set.

### Files/architecture

- `retrieval_service.py`
- `grounding_service.py`
- `context_builder.py`
- `evaluation/`
- Prompt and refusal templates

### Dependencies

No separate vector database, Redis, or Celery.

### Database changes

- Message-to-source relationship
- Retrieval score and rank metadata
- Optional evaluation result tables/files

### API endpoints

The existing streaming endpoint gains grounded retrieval and sources.

### AI considerations

- Retrieval is necessary but does not absolutely guarantee zero hallucinations.
- Critical unknown-answer tests should emphasize safe refusal.
- Test exact numbers, product identifiers, mixed-language questions, and follow-ups.

### Security considerations

- Test user prompt injection.
- Test malicious instructions embedded in documents.
- Never give documents authority over system policy.

### Testing

- Retrieval recall tests
- Grounded answer tests
- Unknown-answer refusal tests
- Citation correctness tests
- Persian questions and mixed Persian/English product-term tests
- Adversarial prompt tests
- Latency and token-budget tests

### Definition of Done

- [ ] The approved evaluation thresholds are met.
- [ ] Unsupported critical questions reliably refuse in the evaluation set.
- [x] Answers can be traced to active document versions.
- [ ] Cost and latency remain within agreed limits.

---

## Phase 7 — Security and privacy hardening

Difficulty: **8/10**
Estimated time: **1 week**

### Goal

Prepare the application to hold real customer information safely.

### Why

Names, phone numbers, and conversations are sensitive business and personal data.

### Tasks

- [ ] Configure secure cookies, CSRF, CORS, and trusted origins.
- [ ] Enforce strong passwords for the Django admin and chatbot user.
- [ ] Add database-backed failed-login throttling/temporary lockout.
- [ ] Expire or rotate sessions according to the approved kiosk policy.
- [ ] Restrict Django Admin by network/IP/VPN when practical.
- [ ] Consider MFA for the Django administrator before production.
- [ ] Add Nginx IP rate limiting.
- [ ] Add session/conversation application limits.
- [ ] Add request-size, message-length, and conversation-length limits.
- [ ] Redact sensitive fields from application and proxy logs.
- [ ] Add retention/deletion management commands.
- [ ] Configure least-privilege database credentials.
- [ ] Protect or disable public access to Django admin.
- [ ] Review dependency and container vulnerabilities.
- [ ] Add a user-facing privacy notice.
- [ ] Establish an incident response and key-rotation process.

### Files/architecture

- Production Django settings
- Nginx security/rate-limit configuration
- Retention/deletion commands
- `docs/security-checklist.md`
- `docs/incident-response.md`

### Dependencies

Add security dependencies only when they solve a specific identified need.

### Database changes

Retention timestamps or deletion/audit metadata if required by the approved policy.

### API endpoints

No new public endpoints unless required for privacy requests.

### AI considerations

Limit sensitive data sent to the AI provider and document what is transmitted.

### Security considerations

This entire phase is security-focused: XSS, CSRF, CORS, SQL injection, abuse, prompt injection, secrets, logs, PII, backups, and access control.

### Testing

- Authentication bypass tests
- Brute-force/lockout tests
- Session fixation, expiration, and logout tests
- Rate-limit tests
- Session isolation tests
- XSS/CSRF/CORS tests
- Secret scanning
- Dependency scanning
- Log-redaction verification
- Retention/deletion tests

### Definition of Done

- [ ] Security checklist is complete.
- [ ] Sensitive data is absent from unsafe logs.
- [ ] Retention and deletion behavior is tested.
- [ ] Production secrets and admin access are protected.

---

## Phase 8 — Automated testing, observability, and operations

Difficulty: **7/10**
Estimated time: **1 week**

### Goal

Make releases diagnosable, testable, and recoverable.

### Why

A production application needs evidence that it works and a process for recovering when it does not.

### Tasks

- [ ] Complete backend unit and integration tests.
- [ ] Complete frontend component tests.
- [ ] Add browser end-to-end tests.
- [ ] Add concurrency and reasonable load tests.
- [ ] Add structured application logs and request IDs.
- [ ] Add liveness and readiness checks.
- [ ] Track latency, failures, token use, and approximate AI cost.
- [ ] Add database backup and restore scripts.
- [ ] Add document backup and restore scripts.
- [ ] Add migration safety checks.
- [ ] Create operational and troubleshooting runbooks.

### Files/architecture

- Backend/frontend test suites
- End-to-end tests
- `scripts/backup/`
- `scripts/restore/`
- `docs/operations.md`
- `docs/backup-and-restore.md`

### Dependencies

- pytest/pytest-django or agreed Django test tooling
- Vitest and React Testing Library or equivalents
- Playwright or equivalent for end-to-end testing

### Database changes

Usage/diagnostic indexes or tables only if required.

### API endpoints

- Internal health/readiness endpoints

### AI considerations

- Monitor token use, timeouts, and refusal rates.
- Do not log full private prompts simply for observability.

### Security considerations

- Restrict operational endpoints.
- Encrypt remote backups.
- Do not place secrets in backup scripts or logs.

### Testing

- CI test run
- Backup creation test
- Full restore rehearsal
- Migration rehearsal
- Simulated provider failure

### Definition of Done

- [ ] CI passes consistently.
- [ ] A fresh environment can be restored from backups.
- [ ] Common failures are visible in safe logs.
- [ ] Operational procedures are documented.

---

## Phase 9 — Ubuntu production deployment

Difficulty: **8/10**
Estimated time: **3–5 working days**

### Goal

Deploy safely to Ubuntu with HTTPS, persistent storage, backups, health checks, and rollback.

### Why

Production contains customer data and cannot be treated as disposable development infrastructure.

### Tasks

- [x] Prepare and update Ubuntu Server 26.04 LTS.
- [x] Create a restricted deployment user.
- [x] Configure SSH keys, disable unsafe SSH access, and configure UFW.
- [x] Install Docker Engine and Docker Compose plugin.
- [x] Create `/opt/ai-chatbot/` and clone the staging branch.
- [ ] Configure production secrets and permissions.
- [ ] Create persistent PostgreSQL and document storage.
- [ ] Configure Nginx and HTTPS certificates.
- [ ] Build images in CI or pull versioned images.
- [ ] Back up database and documents before migrations.
- [ ] Review and apply database migrations.
- [ ] Start containers and check health.
- [ ] Verify logs and AI provider connectivity.
- [ ] Configure restart policies and reasonable resource limits.
- [ ] Configure daily PostgreSQL and document backups.
- [ ] Perform a restore test.
- [ ] Document safe updates and image-tag rollback.

### Files/architecture

- `compose.prod.yaml`
- Production Nginx configuration
- Deployment, backup, restore, and rollback scripts
- `docs/deployment.md`

### Dependencies

- Ubuntu Server 26.04 LTS
- Docker Engine
- Docker Compose plugin
- Public IP for staging; permanent domain and DNS access before customer launch
- Automated TLS certificate solution
- Encrypted remote backup destination

### Database changes

Apply only reviewed migrations after a successful backup.

### API endpoints

Expose only HTTPS application traffic and required health checks.

### AI considerations

Verify production provider eligibility, API key scope, spend limits, model access, and timeouts.

### Security considerations

- Only SSH, HTTP, and HTTPS should be externally reachable as required.
- PostgreSQL must not be publicly exposed.
- Never commit `.env` files or production keys.
- Never use `docker compose down -v` in production.
- Never remove a production volume without a verified backup and explicit approval.

### Backup strategy

- Daily encrypted PostgreSQL logical backup.
- Daily document backup.
- At least one encrypted off-server copy.
- Suggested retention: 7 daily, 4 weekly, 6 monthly.
- Regular restore drills.
- A Docker volume is not considered a backup.

### Testing

- HTTPS and security-header checks
- Health/readiness checks
- Persistence checks
- Backup and restore rehearsal
- Safe update rehearsal
- Rollback rehearsal

### Definition of Done

- [ ] Production is available through HTTPS.
- [ ] PostgreSQL and documents survive container recreation.
- [ ] Backup and restore have been tested.
- [ ] Update and rollback procedures have been tested.
- [ ] Logs and health checks are operational.

---

## Phase 10 — Windows touchscreen kiosk

Difficulty: **5/10**
Estimated time: **2–4 working days**

### Goal

Run the proven web application reliably on the Windows touchscreen stand.

### Why

Kiosk configuration should follow a working web product instead of forcing early Electron or Windows application complexity.

### Tasks

- [ ] Configure Microsoft Edge or Chrome kiosk mode.
- [ ] Configure automatic startup after Windows login/reboot.
- [ ] Test full-screen behavior and escape restrictions.
- [ ] Test the Windows on-screen keyboard.
- [ ] Test Persian typing and embedded English product/model terms.
- [ ] Test touch scrolling and button sizes.
- [ ] Implement idle timeout and visible reset behavior.
- [ ] Clear the prior customer's data after reset.
- [ ] Add a useful offline/network-error screen.
- [ ] Configure browser/app recovery after a crash.
- [ ] Test remote update and cache-refresh behavior.

### Files/architecture

- `docs/kiosk-setup.md`
- Optional kiosk configuration scripts

### Dependencies

No Electron application unless browser kiosk mode proves insufficient.

### Database changes

Optional kiosk identifier only if the business needs it during the pilot.

### API endpoints

No kiosk-specific endpoints unless device registration is approved.

### AI considerations

Provide a clear service-unavailable screen when the AI provider or internet connection fails.

### Security considerations

- Customers must not escape into Windows or administrative screens.
- Previous customer data must not remain visible.
- Do not store production admin credentials on the kiosk.

### Testing

- Reboot recovery
- Browser crash recovery
- Network loss/recovery
- Idle session clearing
- Touch and keyboard tests

### Definition of Done

- [ ] The kiosk starts automatically and recovers after reboot.
- [ ] The interface works comfortably with touch and the on-screen keyboard.
- [ ] Previous sessions clear reliably.
- [ ] Customers cannot reach protected system screens through normal use.

---

## Phase 11 — Pilot and production acceptance

Difficulty: **7/10**
Estimated time: **1–2 weeks**

### Goal

Validate real company content and operating procedures before broad rollout.

### Why

Most remaining failures will involve business content, unclear documents, and real customer behavior rather than basic code.

### Tasks

- [ ] Run a limited kiosk pilot.
- [ ] Review incorrect, weak, and refused answers with company staff.
- [ ] Improve source documents instead of hiding gaps with prompting.
- [ ] Review latency, uptime, token use, and cost.
- [ ] Review retention and deletion behavior.
- [ ] Run backup, restore, provider outage, and rollback drills.
- [ ] Obtain final business and security acceptance.
- [ ] Create the post-MVP backlog.

### Files/architecture

- Pilot report
- Updated evaluation set
- Production acceptance checklist
- Post-MVP backlog

### Dependencies

Representative staff and real approved company content.

### Database changes

Only reviewed fixes. Avoid unnecessary schema expansion during the pilot.

### API endpoints

No new endpoints unless a pilot finding demonstrates a requirement.

### AI considerations

Use unanswered questions as input for improving documents and evaluation coverage.

### Security considerations

Review real operational access, logs, backups, and customer-data handling.

### Testing

Repeat the full evaluation suite and production recovery tests after pilot fixes.

### Definition of Done

- [ ] Business owners approve answer quality and refusal behavior.
- [ ] Security and privacy handling are accepted.
- [ ] Production recovery procedures have been demonstrated.
- [ ] MVP scope is formally complete.

---

## Recommended initial technology decisions

- Fixed frontend stack: React.js with Vite and Tailwind CSS.
- Fixed backend stack: Django with Django REST Framework.
- Fixed database: PostgreSQL; use pgvector if approved for document retrieval, with no separate vector database.
- Fixed environment: Docker and Docker Compose.
- Fixed product language: Persian website, Persian chatbot, and right-to-left customer interface.
- Fixed access model: Persian login page, no public registration, Django session authentication, and users created by an administrator.
- Use separate Django admin and normal chatbot-user accounts.
- Nginx and Gunicorn in production.
- Normal HTTP streaming/SSE; no WebSockets initially.
- No Redis or Celery initially.
- No Kubernetes, Docker Swarm, or microservices.
- No Electron initially.
- No public document-upload feature in the first version.
- Customer phone numbers remain structured business data and are never used as authentication credentials.
- Provider-neutral AI service with OpenAI support only when eligible.
- For eligible OpenAI use, evaluate `gpt-5.6-terra` first and benchmark `gpt-5.6-luna` for cost optimization.
- For eligible OpenAI use, evaluate `text-embedding-3-large` for multilingual retrieval.
- Self-managed pgvector retrieval is preferred over hosted File Search for control, portability, and predictable cost.

---

## Expected schedule

- Basic prototype: **7–12 working days** after Phase 0 and environment setup.
- Professional MVP: **5–8 weeks**.
- Production-ready kiosk: **9–14 weeks**.
- Part-time work, missing documents, or delayed business feedback can extend these estimates.

---

## Initial server recommendation

The proposed Ubuntu server with 2 vCPU, 4 GB RAM, and 50 GB SSD is sufficient for an initial low-traffic deployment if AI inference remains external.

Preferred production starting point for additional headroom:

- 2 vCPU
- 8 GB RAM
- 80 GB SSD
- No GPU required
- Build images in CI and pull versioned images when possible

---

## Major risks to track

- [ ] AI provider regional and account eligibility
- [ ] Poor, scanned, conflicting, or outdated documents
- [ ] Unsupported company claims or hallucinated answers
- [ ] Persian retrieval quality and mixed Persian/English product terminology
- [ ] Customer consent, retention, and deletion requirements
- [ ] Exposing old conversations based on a phone number
- [ ] Shared chatbot credentials being disclosed or reused outside the intended kiosk
- [ ] One shared account providing limited per-person accountability
- [ ] Django Admin being exposed to the public internet
- [ ] Previous customer details remaining visible when the next customer begins
- [ ] Prompt injection from customers or documents
- [ ] Sensitive information in logs
- [ ] Missing off-server backups or untested restores
- [ ] Kiosk sessions failing to clear between customers
- [ ] No staff fallback when information is unavailable
- [ ] Unexpected provider cost caused by long context/history

---

## Future backlog — do not include in the first MVP

- Optional English interface and chatbot language
- Staff document-management interface
- Customer/conversation analytics
- Frequently asked question reporting
- Voice input and text-to-speech
- Persian voice conversations
- Human handoff
- CRM or SMS integration
- Appointment booking
- Multiple kiosk/device management
- Product comparison and recommendation
- QR-code continuation
- Local AI or offline inference
- Electron/native Windows packaging
- Object storage when scale or multi-server deployment requires it
- Redis/background workers when document processing volume requires them

---

## Next action

1. Deploy the latest product-routing update.
2. Upload, inspect, import, and embed any still-pending reviewed general-catalog and Megatite G DOCX files on the VPS.
3. Run Persian regression questions for the general catalog and Megatite G, including product-sheet precedence, missing values, and safety boundaries; then deactivate only their matching legacy sources.
4. Continue the same human-reviewed DOCX workflow for the remaining product documents.
5. Open the application on the touchscreen stand and verify touch comfort, Persian typing, scrolling, and the Windows on-screen keyboard.
