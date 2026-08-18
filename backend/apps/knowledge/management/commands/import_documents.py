import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from apps.knowledge.embeddings import EmbeddingError
from apps.knowledge.extractors import PdfExtractionError
from apps.knowledge.ingestion import import_pdf, inspect_pdf


class Command(BaseCommand):
    help = "Inspect or import approved PDF documents into the private knowledge store."

    def add_arguments(self, parser):
        parser.add_argument("path", help="A PDF file or a directory containing PDF files.")
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Extract and report metadata without writing files or database records.",
        )
        parser.add_argument(
            "--embed",
            action="store_true",
            help="Generate embeddings and activate successfully indexed document versions.",
        )
        parser.add_argument(
            "--ocr",
            action="store_true",
            help="Run local Persian and English OCR when the PDF has no extractable text.",
        )
        parser.add_argument(
            "--sample-characters",
            type=int,
            default=0,
            help="Include up to this many extracted characters in each dry-run report.",
        )

    def handle(self, *args, **options):
        source = Path(options["path"]).resolve()
        if not source.exists():
            raise CommandError(f"Path does not exist: {source}")

        pdfs = [source] if source.is_file() else sorted(source.glob("*.pdf"))
        pdfs = [path for path in pdfs if path.suffix.lower() == ".pdf"]
        if not pdfs:
            raise CommandError("No PDF files were found.")

        failures = 0
        for path in pdfs:
            try:
                if options["dry_run"]:
                    inspection = inspect_pdf(
                        path,
                        ocr=options["ocr"],
                        sample_characters=max(0, options["sample_characters"]),
                    )
                    payload = {
                        "file": path.name,
                        "size_bytes": inspection.file_size,
                        "pages": inspection.page_count,
                        "nonempty_pages": inspection.nonempty_page_count,
                        "characters": inspection.character_count,
                        "chunks": inspection.chunk_count,
                        "needs_ocr": inspection.needs_ocr,
                        "ocr_used": inspection.ocr_used,
                        "sha256": inspection.sha256,
                    }
                    if inspection.sample_text:
                        payload["sample_text"] = inspection.sample_text
                    self.stdout.write(json.dumps(payload, ensure_ascii=False))
                    continue

                result = import_pdf(path, embed=options["embed"], ocr=options["ocr"])
                if result.duplicate:
                    self.stdout.write(
                        self.style.WARNING(
                            f"DUPLICATE {path.name} -> {result.version.document.title} v{result.version.version_number}"
                        )
                    )
                    continue
                self.stdout.write(
                    self.style.SUCCESS(
                        f"IMPORTED {path.name} -> {result.version.document.title} "
                        f"v{result.version.version_number} status={result.version.status} "
                        f"pages={result.version.page_count} chunks={result.version.chunks.count()}"
                    )
                )
            except (PdfExtractionError, EmbeddingError, OSError) as exc:
                failures += 1
                self.stderr.write(self.style.ERROR(f"FAILED {path.name}: {exc}"))

        if failures:
            raise CommandError(f"{failures} PDF file(s) failed.")
