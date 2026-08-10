# AI Customer Assistant

A Docker-first Persian touchscreen customer assistant built with React, Tailwind CSS, Django, Django REST Framework, PostgreSQL, and pgvector.

## Current status

The Phase 5/6 knowledge and retrieval foundation is complete locally. The project has the protected backend plus a responsive Persian RTL kiosk interface for operator login, streamed assistant messages, stored conversations, AI usage/error records, traceable document sources in Django Admin, and manual or automatic customer reset.

AI calls remain intentionally disabled on the Tehran development machine with `AI_PROVIDER=disabled`. The owner-confirmed supported production VPS has successfully completed a live provider streaming test.

The active chat is cleared after 45 seconds without interaction, following a 15-second warning shown only on the chatbot screen. This closes only the customer conversation; the kiosk account remains logged in. The timeout can be adjusted after testing on the physical touchscreen stand.

## Provider location and activation

The development workstation is in Tehran, so local external AI calls remain disabled. The owner has clarified that both the production server and customer kiosk will operate outside Iran in OpenAI-supported countries. Enable `AI_PROVIDER=openai` only in that supported production environment, and do not use the server as a location workaround for local unsupported access.

Official reference: https://help.openai.com/en/articles/5347006-openai-api-supported-countries-and-territories

## Prerequisites

- WSL 2
- Docker Desktop with Docker Compose
- Git

## Start development

1. Copy `.env.example` to `.env` and use development-only values.
2. Start the stack:

```bash
docker compose -f compose.yaml -f compose.dev.yaml up --build
```

Open:

- Frontend: http://localhost:5173
- Backend health: http://localhost:8000/api/v1/health/
- Django Admin: http://localhost:8000/admin/

## Create the two application users

Create the administrator interactively inside Docker:

```bash
docker compose -f compose.yaml -f compose.dev.yaml exec backend python manage.py createsuperuser
```

Then sign in at http://localhost:8000/admin/ and create a separate kiosk user under **Users**. Keep **Active** enabled and leave **Staff status** and **Superuser status** disabled. The administrator and kiosk must not share credentials.

## Backend API

- `GET /api/v1/auth/csrf/` prepares the CSRF cookie.
- `POST /api/v1/auth/login/` logs in the kiosk user. Five failed attempts cause a 15-minute lockout for that username/IP combination.
- `GET /api/v1/auth/me/` returns the current kiosk user.
- `POST /api/v1/auth/logout/` ends the kiosk login.
- `POST /api/v1/sessions/` starts a fresh customer conversation and can optionally attach validated customer details when that intake flow is restored.
- `GET /api/v1/sessions/current/` returns the active customer conversation.
- `GET /api/v1/conversations/{uuid}/messages/` reads messages for only the active browser session.
- `POST /api/v1/conversations/{uuid}/messages/` stores the customer message and returns an authenticated `text/event-stream` response with `customer`, `delta`, `completed`, or `error` events.
- `POST /api/v1/conversations/{uuid}/close/` clears the customer session without logging out the kiosk.

The browser must send the current `X-CSRFToken` value for every state-changing request. Django rotates that token after login.

## Kiosk flow

1. The operator signs in using the normal non-staff kiosk account.
2. The customer sees the Persian introduction and presses **شروع**.
3. The customer can submit messages. Customer messages are always stored in PostgreSQL; the configured production provider then streams a Persian answer to the browser.
4. **New customer** closes the conversation and immediately clears all customer details from the screen without logging out the kiosk.
5. The inactivity timer performs the same privacy reset automatically.

Passwords, customer details, and conversations are not stored in browser local storage.

## AI configuration

Safe configuration placeholders are documented in `.env.example`. Provider secrets belong only in the ignored root `.env`; never add them to React variables, source code, Git, screenshots, logs, or chat messages.

- `AI_PROVIDER=disabled` keeps all external AI calls off.
- `OPENAI_MODEL`, embedding, timeout, output-limit, retrieval, and bounded-context settings configure the production OpenAI adapter.
- A completed provider response is saved once as an assistant message.
- Provider, model, token counts, latency, request identifiers, and safe error categories appear under **AI response logs** in Django Admin.
- Raw provider errors, prompts, customer phone numbers, and secrets are not written to the AI usage log.

PDF OCR, versioned imports, pgvector retrieval, grounding, and answer-source tracking are implemented. The supplied scans passed a narrative-text audit, but some table digits require text-native originals or manual review before exact technical specifications can be activated. See [`docs/knowledge-base.md`](docs/knowledge-base.md).

## Production deployment

The version-controlled Ubuntu/Docker/Nginx deployment flow, including trusted HTTPS for temporary IP staging and automated certificate renewal, is documented in [`docs/deployment.md`](docs/deployment.md). A permanent domain, backup destination, and restore test are still required before customer launch.

## Run checks

```bash
docker compose -f compose.yaml -f compose.dev.yaml run --rm backend python manage.py check
docker compose -f compose.yaml -f compose.dev.yaml run --rm backend python manage.py test
docker compose -f compose.yaml -f compose.dev.yaml run --rm backend python manage.py makemigrations --check --dry-run
docker compose -f compose.yaml -f compose.dev.yaml run --rm frontend npm test
docker compose -f compose.yaml -f compose.dev.yaml run --rm frontend npm run build
```

## Stop development

```bash
docker compose -f compose.yaml -f compose.dev.yaml down
```

Do not add `-v` when production data exists. `docker compose down -v` removes named volumes and can destroy PostgreSQL data.

## Data safety

- PostgreSQL uses a persistent Docker volume.
- Company documents are mounted from `data/documents/` in development and are excluded from Git.
- `.env` is excluded from Git.
- Docker volumes are persistence, not backups. Production backup and restore procedures are added before deployment.
