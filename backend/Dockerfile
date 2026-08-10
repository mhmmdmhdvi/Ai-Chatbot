FROM python:3.13-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_DEFAULT_TIMEOUT=120 \
    PIP_RETRIES=10 \
    PIP_RESUME_RETRIES=10

WORKDIR /app

RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
        tesseract-ocr \
        tesseract-ocr-eng \
        tesseract-ocr-fas \
    && rm -rf /var/lib/apt/lists/*

RUN addgroup --system app && adduser --system --ingroup app app

COPY requirements/base.txt /tmp/requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip \
    attempt=1; \
    while [ "$attempt" -le 3 ]; do \
        pip install --requirement /tmp/requirements.txt && break; \
        if [ "$attempt" -eq 3 ]; then exit 1; fi; \
        echo "pip install failed; retrying ($attempt/3)..." >&2; \
        attempt=$((attempt + 1)); \
        sleep 5; \
    done

COPY . /app
RUN mkdir -p /app/data/documents \
    && chown -R app:app /app

USER app

FROM base AS development
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]

FROM base AS production
RUN DJANGO_SECRET_KEY=build-only-static-key-not-used-at-runtime \
    DJANGO_DEBUG=false \
    python manage.py collectstatic --noinput
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2", "--timeout", "90"]
