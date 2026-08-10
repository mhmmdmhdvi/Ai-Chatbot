import json
from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path

from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Max

from .chunking import chunk_pages
from .extractors.pdf import ExtractedPage, PdfExtractionError
from .ingestion import index_document_version
from .models import Document, DocumentChunk, DocumentVersion
from .normalization import normalize_persian_text, normalize_source_key


@dataclass(frozen=True)
class VerifiedImportResult:
    version: DocumentVersion
    created: bool
    duplicate: bool


def _read_manifest(path):
    source = Path(path)
    raw_content = source.read_bytes()
    try:
        manifest = json.loads(raw_content.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise PdfExtractionError("The verified knowledge manifest is not valid UTF-8 JSON.") from exc

    required = {
        "schema_version",
        "source_key",
        "title",
        "source_filename",
        "source_sha256",
        "source_page_count",
        "entries",
    }
    if not required.issubset(manifest) or manifest["schema_version"] != 1:
        raise PdfExtractionError("The verified knowledge manifest schema is invalid.")
    if not isinstance(manifest["entries"], list) or not manifest["entries"]:
        raise PdfExtractionError("The verified knowledge manifest has no entries.")
    if not isinstance(manifest["source_page_count"], int) or manifest["source_page_count"] < 1:
        raise PdfExtractionError("The verified knowledge source page count is invalid.")
    if not _is_sha256(manifest["source_sha256"]):
        raise PdfExtractionError("The verified knowledge source checksum is invalid.")
    return raw_content, manifest


def _is_sha256(value):
    if not isinstance(value, str) or len(value) != 64:
        return False
    return all(character in "0123456789abcdef" for character in value.casefold())


def import_verified_manifest(path, *, embed=False):
    source = Path(path)
    raw_content, manifest = _read_manifest(source)
    manifest_checksum = sha256(raw_content).hexdigest()
    duplicate = DocumentVersion.objects.filter(sha256=manifest_checksum).select_related(
        "document"
    ).first()
    if duplicate:
        if embed and duplicate.status != DocumentVersion.Status.READY:
            index_document_version(duplicate)
        return VerifiedImportResult(version=duplicate, created=False, duplicate=True)

    source_key = normalize_source_key(manifest["source_key"])
    title = normalize_persian_text(manifest["title"])
    source_filename = Path(manifest["source_filename"]).name
    pages = []
    for entry in manifest["entries"]:
        page_number = entry.get("page_number")
        content = normalize_persian_text(entry.get("content"))
        if (
            not isinstance(page_number, int)
            or page_number < 1
            or page_number > manifest["source_page_count"]
            or len(content) < 40
        ):
            raise PdfExtractionError("A verified knowledge entry is invalid.")
        pages.append(ExtractedPage(page_number=page_number, text=content))

    chunks = chunk_pages(pages)
    if not chunks:
        raise PdfExtractionError("The verified knowledge manifest produced no chunks.")

    with transaction.atomic():
        document, _ = Document.objects.get_or_create(
            source_key=source_key,
            defaults={"title": title},
        )
        latest_number = document.versions.aggregate(value=Max("version_number"))["value"] or 0
        version = DocumentVersion(
            document=document,
            version_number=latest_number + 1,
            original_filename=source_filename,
            sha256=manifest_checksum,
            file_size=len(raw_content),
            page_count=manifest["source_page_count"],
            extracted_character_count=sum(len(page.text) for page in pages),
            ocr_used=False,
            content_verified=True,
            status=DocumentVersion.Status.PENDING,
        )
        version.file.save(source.name, ContentFile(raw_content), save=False)
        version.save()
        DocumentChunk.objects.bulk_create(
            [
                DocumentChunk(
                    version=version,
                    page_number=chunk.page_number,
                    chunk_index=chunk.chunk_index,
                    content=chunk.content,
                    content_hash=chunk.content_hash,
                    character_count=len(chunk.content),
                )
                for chunk in chunks
            ]
        )

    if embed:
        index_document_version(version)
    return VerifiedImportResult(version=version, created=True, duplicate=False)
