# AI Customer Assistant

A Docker-first Persian touchscreen customer assistant built with React, Tailwind CSS, Django, Django REST Framework, PostgreSQL, and pgvector.

## Current status

Phase 1 establishes the repository, containers, database, Django health endpoint, custom user model, and a minimal Persian RTL frontend. Authentication, customer intake, chat, document retrieval, and AI integration are implemented in later phases described in `task.md`.

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

## Run checks

```bash
docker compose -f compose.yaml -f compose.dev.yaml run --rm backend python manage.py check
docker compose -f compose.yaml -f compose.dev.yaml run --rm backend python manage.py test
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
