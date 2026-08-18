# Knowledge-base operations

## Current approved-file audit

The 15 PDFs supplied on 2026-08-10 are all image-based scans. A read-only local audit processed 58 pages into 58 candidate chunks and approximately 74,000 characters. Narrative Persian text is readable enough for general retrieval, but OCR dropped digits in some technical tables.

Do not treat exact OCR-derived numbers as approved technical specifications. Retrieved OCR sources are labelled `OCR_REVIEW_REQUIRED`, and the assistant is instructed to use them for general explanations while referring exact numeric questions for staff review.

The page-2 application and curing table for **Megatite S** has been manually checked against the supplied PDF and is shipped as checksum-bound `VERIFIED` knowledge. It includes the 1:1 mix ratio, 45-minute working time at 25°C, 12-hour initial cure at 25°C, and the temperature-dependent cure tables.

The vision extraction pipeline was exercised against all three pages of the same datasheet on 2026-08-11. It recovered 38 structured technical numeric facts, and both high-detail passes agreed with one another. A later human comparison still found an incorrect storage temperature in the AI transcription. Two agreeing AI passes therefore do not count as human verification, and vision-only output must not be activated as exact technical knowledge.

The preferred production path is now a text-native DOCX typed and checked by a person against the source PDF. DOCX import is deliberately strict: it accepts body paragraphs and tables in document order, but rejects macros, media, drawings, text boxes, tracked changes, headers/footers, and embedded objects so reviewed content cannot be silently omitted.

Human-reviewed DOCX versions of **Megatite S**, **Megatite C**, and **Megatite SF** are active in production. Product-specific verified datasheets outrank a verified general catalog whenever both are retrieved; general portfolio claims must not be applied to an individual product unless its own datasheet supports them.

The 20-page Persian general catalog required a curated rebuild because its supplied DOCX contained transcription errors, missing chart/table data, and broad marketing claims. The reviewed catalog intentionally excludes the ambiguous four-column core-barrel engineering table, unlabeled chart values, and time-sensitive certificates and contact details. Those items require separate authoritative confirmation before activation.

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

## Human-reviewed DOCX import

First inspect the Word file without writing to the database or calling OpenAI:

```bash
docker compose -f compose.yaml -f compose.prod.yaml run --rm --no-deps \
  --volume "/opt/ai-chatbot/imports:/imports:ro" \
  backend python manage.py import_verified_docx \
  "/imports/Megatite S.docx" --dry-run --sample-characters 500
```

Compare every paragraph and every table with the original source. Only after that human review succeeds, import and embed it with a stable source key:

```bash
docker compose -f compose.yaml -f compose.prod.yaml run --rm \
  --volume "/opt/ai-chatbot/imports:/imports:ro" \
  backend python manage.py import_verified_docx \
  "/imports/Megatite S.docx" \
  --source-key "verified:megatite-s-technical-fa" \
  --title "Megatite S - verified technical data" \
  --confirm-reviewed --embed
```

`--confirm-reviewed` is an intentional trust boundary; never use it for unreviewed OCR or AI-generated text. A DOCX is stored as one logical page because Word pagination depends on fonts and rendering. Reimporting a changed DOCX with the same source key creates a new immutable version and activates it only after embedding succeeds.

After the new version passes retrieval and live-answer tests, list active sources for that product and deactivate the exact source keys of its old OCR/vision documents. Do not delete the source files or database volumes.

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

The mechanical verifier reports `trusted_pages=N/N` when its two passes agree, but this is still a review candidate rather than human-verified content. Any `REVIEW_REQUIRED` page must be checked, and even agreeing pages must be compared with the original before exact facts can be trusted. Private reports and generated manifests remain in the persistent `documents_data` volume and are not served by Nginx.

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

Exact technical values must remain a staff-review response unless they come from a human-reviewed `VERIFIED` source. Two-pass vision agreement alone is not human verification.
