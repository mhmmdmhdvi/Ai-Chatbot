#!/bin/sh
set -eu

if [ "$#" -ne 0 ]; then
    echo "Usage: $0" >&2
    exit 1
fi

unset CDPATH
project_dir=$(cd -- "$(dirname -- "$0")/../.." && pwd)

cd "$project_dir"

compose() {
    docker compose -f compose.yaml -f compose.prod.yaml "$@"
}

if [ ! -f .env ]; then
    echo "Missing $project_dir/.env" >&2
    exit 1
fi

public_host=$(sed -n 's/^PUBLIC_HOST=//p' .env | tail -n 1)
certificate_email=$(sed -n 's/^CERTBOT_EMAIL=//p' .env | tail -n 1)
if [ -z "$public_host" ] || [ -z "$certificate_email" ]; then
    echo "PUBLIC_HOST and CERTBOT_EMAIL must be set in .env" >&2
    exit 1
fi

bootstrap_started=false

cleanup() {
    if [ "$bootstrap_started" = "true" ]; then
        compose --profile bootstrap rm -sf nginx-bootstrap >/dev/null 2>&1 || true
    fi
}
trap cleanup EXIT INT TERM

if ! compose ps --status running --services nginx | grep -qx nginx; then
    compose --profile bootstrap up -d nginx-bootstrap
    bootstrap_started=true
fi

attempt=0
until curl -fsS http://127.0.0.1/ >/dev/null; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 15 ]; then
        echo "Nginx certificate challenge endpoint did not become ready." >&2
        exit 1
    fi
    sleep 1
done

if printf '%s' "$public_host" | grep -Eq '^[0-9]{1,3}(\.[0-9]{1,3}){3}$'; then
    compose --profile certificate run --rm certbot certonly \
        --non-interactive \
        --agree-tos \
        --email "$certificate_email" \
        --preferred-profile shortlived \
        --webroot \
        --webroot-path /var/www/certbot \
        --ip-address "$public_host"
else
    compose --profile certificate run --rm certbot certonly \
        --non-interactive \
        --agree-tos \
        --email "$certificate_email" \
        --webroot \
        --webroot-path /var/www/certbot \
        --domain "$public_host"
fi

echo "Certificate issued for $public_host."
