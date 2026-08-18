from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.knowledge.embeddings import EmbeddingError
from apps.knowledge.extractors import PdfExtractionError
from apps.knowledge.verified import import_verified_manifest
from apps.knowledge.vision_extraction import (
    VisionExtractionError,
    extract_pdf_with_vision,
)


class Command(BaseCommand):
    help = "Extract scanned PDFs with OpenAI vision and optionally index trusted pages."

    def add_arguments(self, parser):
        parser.add_argument("path", help="A PDF file or a directory containing PDF files.")
        parser.add_argument(
            "--output-dir",
            default=str(settings.MEDIA_ROOT / "vision-extractions"),
            help="Private directory for extraction reports and generated manifests.",
        )
        parser.add_argument(
            "--passes",
            type=int,
            choices=(1, 2),
            default=2,
            help="Use two passes by default to cross-check numbers and tables.",
        )
        parser.add_argument("--model", help="Override OPENAI_DOCUMENT_EXTRACTION_MODEL.")
        parser.add_argument(
            "--batch-pages",
            type=int,
            choices=range(1, 11),
            default=settings.OPENAI_DOCUMENT_BATCH_PAGES,
            help="Send at most this many pages per resumable API batch (default: 3).",
        )
        parser.add_argument(
            "--embed",
            action="store_true",
            help="Import, embed, and activate trusted extracted pages.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Repeat paid extraction even when a matching report already exists.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=0,
            help="Process at most this many PDFs; useful for a first live test.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="List matching PDFs without calling OpenAI or writing data.",
        )

    def handle(self, *args, **options):
        source = Path(options["path"]).resolve()
        if not source.exists():
            raise CommandError(f"Path does not exist: {source}")

        pdfs = [source] if source.is_file() else sorted(source.glob("*.pdf"))
        pdfs = [path for path in pdfs if path.suffix.lower() == ".pdf"]
        if options["limit"] > 0:
            pdfs = pdfs[: options["limit"]]
        if not pdfs:
            raise CommandError("No PDF files were found.")

        if options["dry_run"]:
            for path in pdfs:
                self.stdout.write(f"PDF {path.name} size_bytes={path.stat().st_size}")
            self.stdout.write(self.style.SUCCESS(f"READY_FOR_VISION_EXTRACTION={len(pdfs)}"))
            return

        failures = 0
        for path in pdfs:
            try:
                result = extract_pdf_with_vision(
                    path,
                    output_dir=options["output_dir"],
                    passes=options["passes"],
                    model=options["model"],
                    batch_pages=options["batch_pages"],
                    force=options["force"],
                    progress=self.stdout.write,
                )
                label = "REUSED" if result.reused else "EXTRACTED"
                self.stdout.write(
                    self.style.SUCCESS(
                        f"{label} {path.name} trusted_pages={result.trusted_page_count}/"
                        f"{result.page_count} review_pages={result.review_page_count} "
                        f"input_tokens={result.input_tokens} output_tokens={result.output_tokens}"
                    )
                )

                if result.manifest_path is None:
                    self.stderr.write(
                        self.style.WARNING(
                            f"REVIEW_REQUIRED {path.name}: no page was safe to activate. "
                            f"See {result.report_path}"
                        )
                    )
                    continue

                if result.review_page_count:
                    self.stderr.write(
                        self.style.WARNING(
                            f"REVIEW_REQUIRED {path.name}: {result.review_page_count} page(s) "
                            f"were preserved in the report but excluded from trusted knowledge."
                        )
                    )

                if options["embed"]:
                    imported = import_verified_manifest(result.manifest_path, embed=True)
                    import_label = "DUPLICATE" if imported.duplicate else "INDEXED"
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"{import_label} {path.name} status={imported.version.status} "
                            f"chunks={imported.version.chunks.count()}"
                        )
                    )
            except (
                VisionExtractionError,
                PdfExtractionError,
                EmbeddingError,
                OSError,
            ) as exc:
                failures += 1
                self.stderr.write(self.style.ERROR(f"FAILED {path.name}: {exc}"))

        if failures:
            raise CommandError(f"{failures} PDF file(s) failed vision extraction.")
