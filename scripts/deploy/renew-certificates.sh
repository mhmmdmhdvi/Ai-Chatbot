#!/bin/sh
set -eu

unset CDPATH
project_dir=$(cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$project_dir"

compose() {
    docker compose -f compose.yaml -f compose.prod.yaml "$@"
}

compose --profile certificate run --rm certbot renew --quiet

if compose ps --status running --services nginx | grep -qx nginx; then
    compose exec -T nginx nginx -s reload
fi
