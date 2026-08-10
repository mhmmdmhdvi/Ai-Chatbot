# Ubuntu Docker deployment

This guide deploys the application to one Ubuntu server with Docker Compose, Nginx, Gunicorn, PostgreSQL/pgvector, and a trusted TLS certificate. Use the IP-certificate flow only for staging; replace the IP with the final domain before customer launch.

## Architecture

Only Nginx publishes host ports. Django and PostgreSQL stay on the private Compose network.

```text
Internet :80/:443
        |
      Nginx -- React static files
        |
      Gunicorn/Django
        |
   PostgreSQL/pgvector
```

Certbot uses a shared webroot for HTTP validation. Certificates are stored in a named Docker volume and mounted read-only into Nginx.

## Prerequisites

- A supported Ubuntu server with Docker Engine and the Compose plugin
- A non-root `deploy` user with SSH-key access, sudo, and Docker-group membership
- UFW allowing only SSH, HTTP, and HTTPS
- This repository cloned to `/opt/ai-chatbot`
- A public IPv4 address or domain that resolves to the server

## Create production environment settings

From `/opt/ai-chatbot`:

```bash
umask 077
cp .env.example .env
openssl rand -hex 32
openssl rand -hex 32
nano .env
chmod 600 .env
```

Use one generated value for `POSTGRES_PASSWORD` and the other for `DJANGO_SECRET_KEY`. Never paste either secret into chat, Git, shell scripts, screenshots, or documentation.

For IP-address staging, set:

```dotenv
COMPOSE_PROJECT_NAME=ai_chatbot_prod
PUBLIC_HOST=<server-ip>
CERTBOT_EMAIL=<private-certificate-email>

POSTGRES_DB=ai_chatbot
POSTGRES_USER=ai_chatbot
POSTGRES_PASSWORD=<generated-database-password>
POSTGRES_HOST=db
POSTGRES_PORT=5432

DJANGO_SECRET_KEY=<generated-django-secret>
DJANGO_DEBUG=false
DJANGO_ALLOWED_HOSTS=<server-ip>,backend,127.0.0.1
DJANGO_CSRF_TRUSTED_ORIGINS=https://<server-ip>
DJANGO_SECURE_SSL_REDIRECT=true
DJANGO_SECURE_HSTS_SECONDS=0
DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS=false
DJANGO_SECURE_HSTS_PRELOAD=false

AI_PROVIDER=openai
OPENAI_API_KEY=<production-provider-key>
OPENAI_MODEL=gpt-5.6-terra
OPENAI_TIMEOUT_SECONDS=30
OPENAI_MAX_OUTPUT_TOKENS=800
AI_CONTEXT_MESSAGE_LIMIT=16
AI_CONTEXT_CHARACTER_LIMIT=24000
```

HSTS remains off for temporary IP staging. Enable a reviewed HSTS policy only after the permanent HTTPS domain works reliably.

## Validate Compose without exposing secrets

```bash
docker compose -f compose.yaml -f compose.prod.yaml config --quiet
```

Do not paste the full output of `docker compose config`; it contains interpolated environment values.

## Obtain the initial certificate

The bootstrap script reads `PUBLIC_HOST` and `CERTBOT_EMAIL` from `.env`:

```bash
./scripts/deploy/bootstrap-certificate.sh
```

For an IP address, Certbot requests Let's Encrypt's required short-lived profile. For a domain, it requests a normal domain certificate. The temporary Nginx service exposes only the ACME challenge while the certificate is issued.

## Build and start the application

```bash
./scripts/deploy/deploy.sh
```

The script validates the merged Compose configuration, builds fresh images, runs Django's deployment checks, applies reviewed migrations, starts the services, and prints container status.

## Automate certificate renewal

IP certificates are valid for roughly six days, so renewal cannot be manual.

```bash
./scripts/deploy/install-renewal-timer.sh
sudo systemctl status ai-chatbot-certbot-renew.timer --no-pager
```

Test the renewal path without obtaining a new certificate:

```bash
docker compose -f compose.yaml -f compose.prod.yaml --profile certificate run --rm certbot renew --dry-run
```

## Create production users

The production database starts empty; local users are not copied.

```bash
docker compose -f compose.yaml -f compose.prod.yaml exec backend python manage.py createsuperuser
```

Sign in to `/admin/`, create a separate active kiosk user, and leave staff/superuser disabled for that kiosk account.

## Verify

```bash
docker compose -f compose.yaml -f compose.prod.yaml ps
docker compose -f compose.yaml -f compose.prod.yaml logs --tail 100 backend nginx
curl -I "https://<server-ip>/"
curl "https://<server-ip>/api/v1/health/"
```

Expected health response:

```json
{"status":"ok","service":"backend"}
```

## Safety rules

- Never commit `.env` or production secrets.
- Never expose PostgreSQL port 5432 or Django port 8000 on the host.
- Never run `docker compose down -v` against production; `-v` deletes persistent volumes.
- Back up PostgreSQL and documents before applying future migrations.
- Keep the server branch clean; make infrastructure changes in Git, review them, then pull.
- Replace IP staging with the permanent domain, new certificate, and reviewed HSTS settings before customer launch.
