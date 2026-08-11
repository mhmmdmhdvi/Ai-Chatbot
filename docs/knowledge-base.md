# Knowledge-base operations

## Current approved-file audit

The 15 PDFs supplied on 2026-08-10 are all image-based scans. A read-only local audit processed 58 pages into 58 candidate chunks and approximately 74,000 characters. Narrative Persian text is readable enough for general retrieval, but OCR dropped digits in some technical tables.

Do not treat exact OCR-derived numbers as approved technical specifications. Retrieved OCR sources are labelled `OCR_REVIEW_REQUIRED`, and the assistant is instructed to use them for general explanations while referring exact numeric questions for staff review.

The page-2 application and curing table for **Megatite S** has been manually checked against the supplied PDF and is shipped as checksum-bound `VERIFIED` knowledge. It includes the 1:1 mix ratio, 45-minute working time at 25°C, 12-hour initial cure at 25°C, and the temperature-dependent cure tables.

The vision extraction pipeline was validated against all three pages of the same datasheet on 2026-08-11. It recovered 38 structured technical numeric facts, and both high-detail passes agreed on every technical value. The remaining PDFs must pass the same production extraction before their exact values become active.

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

## High-detail extraction for scanned PDFs

Use the vision command for the supplied image-only PDFs. It sends at most three original PDF pages per API batch so the model receives both page images and any available PDF text, requests structured page output, and performs two independent passes. Technical numeric facts are compared between passes; a page with uncertainty or a disagreement is retained in the private audit report but excluded from active knowledge.

Every completed pass is atomically saved in a private `.vision-work.json` checkpoint. A timeout, provider failure, SSH disconnect, or command retry therefore resumes at the first unfinished pass instead of repeating successful paid calls. Page numbers are restored to their original positions before indexing.

Run extraction and embedding once on the production VPS, where the private imports already exist:

```bash
cd /opt/ai-chatbot

docker compose -f compose.yaml -f compose.prod.yaml run --rm \
  --volume "/opt/ai-chatbot/imports/New folder:/imports:ro" \
  backend python manage.py extract_documents_with_vision \
  /imports --passes 2 --embed \
  2>&1 | tee /var/tmp/ai-chatbot-vision-import.log
```

The command is resumable at both document and page-batch level. A matching extraction report is reused on retry, and incomplete documents resume from their saved pass checkpoint. Use `--force` only when intentionally discarding those paid results after changing the prompt or model.

Expected output for each file is `trusted_pages=N/N`, `review_pages=0`, and `INDEXED ... status=ready`. Any `REVIEW_REQUIRED` page must be checked before it can be used for exact answers. Private reports and generated verified manifests remain in the persistent `documents_data` volume and are not served by Nginx.

Useful checks after the run:

```bash
grep -E '^(EXTRACTED|REUSED|INDEXED|DUPLICATE|REVIEW_REQUIRED|FAILED)' \
  /var/tmp/ai-chatbot-vision-import.log

docker compose -f compose.yaml -f compose.prod.yaml exec -T backend \
  python manage.py shell -c \
  "from apps.knowledge.models import DocumentVersion; print('VISION_READY=', DocumentVersion.objects.filter(document__source_key__startswith='verified:vision:', status='ready').count())"
```

## Load reviewed technical values

Reviewed manifests are versioned with the application and loaded separately from OCR documents. After deploying code and running migrations, load and embed them with:

```bash
docker compose -f compose.yaml -f compose.prod.yaml run --rm \
  backend python manage.py load_verified_knowledge --embed
```

The command is idempotent: rerunning the same manifest reports it as a duplicate. Verified values receive retrieval priority, while the original OCR documents remain available for general narrative answers.

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

Exact technical values must remain a staff-review response unless they come from a `VERIFIED` source. This includes the manually checked Megatite S page-2 source and pages accepted by the two-pass vision verifier.
