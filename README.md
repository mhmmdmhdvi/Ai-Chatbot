# AI Customer Assistant

A Docker-first Persian touchscreen customer assistant built with React, Tailwind CSS, Django, Django REST Framework, PostgreSQL, and pgvector.

## Current status

Phase 3 application implementation is complete. The project now has the protected backend plus a responsive Persian RTL kiosk interface for operator login, customer intake, stored chat messages, operator logout, and manual or automatic customer reset.

AI integration is intentionally disabled. No OpenAI package or API key is required at this stage, and the message API reports `ai_status: "disabled"`.

The active customer is cleared after three minutes without interaction, with a 30-second warning. This closes only the customer conversation; the kiosk account remains logged in. The timeout can be adjusted after testing on the physical touchscreen stand.

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
- `POST /api/v1/sessions/` validates an Iranian phone number and starts a fresh customer conversation.
- `GET /api/v1/sessions/current/` returns the active customer conversation.
- `GET|POST /api/v1/conversations/{uuid}/messages/` reads or stores messages for only the active browser session.
- `POST /api/v1/conversations/{uuid}/close/` clears the customer session without logging out the kiosk.

The browser must send the current `X-CSRFToken` value for every state-changing request. Django rotates that token after login.

## Kiosk flow

1. The operator signs in using the normal non-staff kiosk account.
2. The customer enters a name and Iranian mobile number.
3. The customer can submit messages; they are stored in PostgreSQL while AI is disabled.
4. **New customer** closes the conversation and immediately clears all customer details from the screen without logging out the kiosk.
5. The inactivity timer performs the same privacy reset automatically.

Passwords, customer details, and conversations are not stored in browser local storage.

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
