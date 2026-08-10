from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path

from django.conf import settings
from django.core.files import File
from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from .chunking import chunk_pages
from .embeddings import EmbeddingError, create_embeddings
from .extractors import PdfExtractionError, extract_pdf
from .models import Document, DocumentChunk, DocumentVersion
from .normalization import normalize_source_key


@dataclass(frozen=True)
class PdfInspection:
    path: Path
    sha256: str
    file_size: int
    page_count: int
    character_count: int
    nonempty_page_count: int
    chunk_count: int
    needs_ocr: bool
    ocr_used: bool
    sample_text: str


@dataclass(frozen=True)
class ImportResult:
    version: DocumentVersion
    created: bool
    duplicate: bool


def file_sha256(path):
    digest = sha256()
    with Path(path).open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def validate_pdf_source(path):
    source = Path(path)
    if source.suffix.lower() != ".pdf":
        raise PdfExtractionError("Only PDF files are supported.")
    if not source.is_file():
        raise PdfExtractionError("The PDF file does not exist or is not a regular file.")
    file_size = source.stat().st_size
    if file_size == 0:
        raise PdfExtractionError("The PDF file is empty.")
    if file_size > settings.KNOWLEDGE_MAX_FILE_BYTES:
        raise PdfExtractionError("The PDF file exceeds the configured size limit.")
    return source


def inspect_pdf(path, *, ocr=False, sample_characters=0):
    source = validate_pdf_source(path)
    extraction = extract_pdf(source, allow_ocr=ocr)
    chunks = chunk_pages(extraction.pages)
    sample_text = "\n\n".join(page.text for page in extraction.pages if page.text)
    return PdfInspection(
        path=source,
        sha256=file_sha256(source),
        file_size=source.stat().st_size,
        page_count=extraction.page_count,
        character_count=extraction.character_count,
        nonempty_page_count=extraction.nonempty_page_count,
        chunk_count=len(chunks),
        needs_ocr=extraction.needs_ocr,
        ocr_used=extraction.ocr_used,
        sample_text=sample_text[:sample_characters] if sample_characters else "",
    )


def _embed_version(version):
    chunks = list(version.chunks.order_by("page_number", "chunk_index"))
    batch_size = settings.KNOWLEDGE_EMBEDDING_BATCH_SIZE
    for start in range(0, len(chunks), batch_size):
        batch = chunks[start : start + batch_size]
        vectors = create_embeddings([chunk.content for chunk in batch])
        for chunk, vector in zip(batch, vectors, strict=True):
            chunk.embedding = vector
        DocumentChunk.objects.bulk_update(batch, ("embedding",), batch_size=batch_size)


def index_document_version(version):
    if not version.chunks.exists():
        raise EmbeddingError("The document version has no extracted chunks to index.")

    try:
        _embed_version(version)
    except EmbeddingError:
        version.status = DocumentVersion.Status.FAILED
        version.is_active = False
        version.error_message = "بردارسازی سند انجام نشد. تنظیمات و اتصال سرویس بررسی شود."
        version.save(update_fields=("status", "is_active", "error_message"))
        raise

    with transaction.atomic():
        DocumentVersion.objects.filter(document=version.document, is_active=True).exclude(
            pk=version.pk
        ).update(is_active=False)
        if not version.document.is_active:
            version.document.is_active = True
            version.document.save(update_fields=("is_active", "updated_at"))
        version.status = DocumentVersion.Status.READY
        version.is_active = True
        version.error_message = ""
        version.embedding_model = settings.OPENAI_EMBEDDING_MODEL
        version.embedding_dimensions = settings.OPENAI_EMBEDDING_DIMENSIONS
        version.indexed_at = timezone.now()
        version.save(
            update_fields=(
                "status",
                "is_active",
                "error_message",
                "embedding_model",
                "embedding_dimensions",
                "indexed_at",
            )
        )
    return version


def activate_document_version(version):
    if version.status != DocumentVersion.Status.READY:
        raise ValueError("Only a ready document version can be activated.")
    if version.embedding_dimensions != settings.OPENAI_EMBEDDING_DIMENSIONS:
        raise ValueError("The document version uses an incompatible embedding size.")
    if version.chunks.filter(embedding__isnull=True).exists():
        raise ValueError("The document version is not fully indexed.")

    with transaction.atomic():
        DocumentVersion.objects.filter(document=version.document, is_active=True).exclude(
            pk=version.pk
        ).update(is_active=False)
        if not version.document.is_active:
            version.document.is_active = True
            version.document.save(update_fields=("is_active", "updated_at"))
        version.is_active = True
        version.save(update_fields=("is_active",))
    return version


def deactivate_document(document):
    with transaction.atomic():
        DocumentVersion.objects.filter(document=document, is_active=True).update(is_active=False)
        document.is_active = False
        document.save(update_fields=("is_active", "updated_at"))
    return document


def import_pdf(path, *, embed=False, ocr=False):
    source = validate_pdf_source(path)
    checksum = file_sha256(source)
    duplicate = DocumentVersion.objects.filter(sha256=checksum).select_related("document").first()
    if duplicate:
        return ImportResult(version=duplicate, created=False, duplicate=True)

    extraction = extract_pdf(source, allow_ocr=ocr)
    source_key = normalize_source_key(source.stem)
    if not source_key:
        raise PdfExtractionError("The PDF filename does not produce a valid source identifier.")

    with transaction.atomic():
        document, _ = Document.objects.get_or_create(
            source_key=source_key,
            defaults={"title": source.stem.strip()},
        )
        latest_number = document.versions.aggregate(value=Max("version_number"))["value"] or 0
        version = DocumentVersion(
            document=document,
            version_number=latest_number + 1,
            original_filename=source.name,
            sha256=checksum,
            file_size=source.stat().st_size,
            page_count=extraction.page_count,
            extracted_character_count=extraction.character_count,
            ocr_used=extraction.ocr_used,
            status=(
                DocumentVersion.Status.NEEDS_OCR
                if extraction.needs_ocr
                else DocumentVersion.Status.PENDING
            ),
        )
        with source.open("rb") as source_file:
            version.file.save(source.name, File(source_file), save=False)
        version.save()

        if not extraction.needs_ocr:
            chunks = chunk_pages(extraction.pages)
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
                ],
                batch_size=500,
            )

    if extraction.needs_ocr or not embed:
        return ImportResult(version=version, created=True, duplicate=False)

    index_document_version(version)
    return ImportResult(version=version, created=True, duplicate=False)
