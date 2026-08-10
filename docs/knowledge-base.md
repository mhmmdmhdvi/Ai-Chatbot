# Knowledge-base operations

## Current approved-file audit

The 15 PDFs supplied on 2026-08-10 are all image-based scans. A read-only local audit processed 58 pages into 58 candidate chunks and approximately 74,000 characters. Narrative Persian text is readable enough for general retrieval, but OCR dropped digits in some technical tables.

Do not treat exact OCR-derived numbers as approved technical specifications. Retrieved OCR sources are labelled `OCR_REVIEW_REQUIRED`, and the assistant is instructed to use them for general explanations while referring exact numeric questions for staff review.

## Design

- Original files are private and stored in the `documents_data` Docker volume, outside static/public paths.
- Documents have immutable versions and SHA-256 duplicate detection.
- Only one ready version of each document can be active.
- Chunks retain document, version, page, and position metadata.
- Embeddings use `text-embedding-3-large` shortened to 1024 dimensions and are stored in PostgreSQL/pgvector.
- Every grounded assistant answer stores its retrieved chunk, rank, and similarity in Django Admin.
- There is no public document-upload endpoint.

## Safe local OCR audit

This command performs extraction only. It does not write database records and does not call OpenAI:

```powershell
docker compose run --rm --no-deps `
  --volume "C:\Users\PCG-197\Desktop\Ai Chatbot\backend:/app" `
  --volume "C:\Users\PCG-197\Downloads\New folder:/imports:ro" `
  -T backend python manage.py import_documents /imports --dry-run --ocr
```

## Production import

Copy only reviewed files to a private server directory such as `/opt/ai-chatbot/imports`. The directory must not be served by Nginx.

After deploying the code and applying migrations:

```bash
cd /opt/ai-chatbot
chmod 700 /opt/ai-chatbot/imports

docker compose -f compose.yaml -f compose.prod.yaml run --rm \
  --volume /opt/ai-chatbot/imports:/imports:ro \
  backend python manage.py import_documents /imports --ocr --embed
```

The command activates a version only after every chunk receives an embedding. If embedding fails after extraction, retry pending/failed versions with:

```bash
docker compose -f compose.yaml -f compose.prod.yaml run --rm \
  backend python manage.py index_documents --all-pending
```

## Rollback or deactivate

Version UUIDs and document source keys are visible in Django Admin.

```bash
docker compose -f compose.yaml -f compose.prod.yaml run --rm \
  backend python manage.py set_document_state --activate-version VERSION_UUID
```

```bash
docker compose -f compose.yaml -f compose.prod.yaml run --rm \
  backend python manage.py set_document_state --deactivate-document "SOURCE KEY"
```

## Required acceptance test

Before customer use, test Persian questions for:

- product descriptions and general applications;
- mixed Persian/English product names;
- exact temperatures, ratios, curing times, and strength values;
- facts not present in the documents;
- customer and document prompt-injection attempts;
- answer-source accuracy in Django Admin.

Exact technical values must remain a staff-review response until text-native originals or manually corrected and approved content are available.
