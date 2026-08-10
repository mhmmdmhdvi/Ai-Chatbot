#!/bin/sh
set -eu

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

compose config --quiet
compose build --pull
compose run --rm backend python manage.py check --deploy
compose run --rm backend python manage.py migrate
compose up -d
compose ps
