import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from apps.knowledge.embeddings import EmbeddingError
from apps.knowledge.extractors import MarkdownExtractionError
from apps.knowledge.verified import import_verified_markdown, inspect_verified_markdown


class Command(BaseCommand):
    help = "Inspect or import a human-reviewed Markdown file as trusted knowledge."

    def add_arguments(self, parser):
        parser.add_argument("path", help="A reviewed .md Markdown file.")
        parser.add_argument("--source-key", help="Stable source key used for document versioning.")
        parser.add_argument("--title", help="Document title shown in Django admin and citations.")
        parser.add_argument(
            "--confirm-reviewed",
            action="store_true",
            help="Confirm that every fact has been checked before trusted import.",
        )
        parser.add_argument(
            "--embed",
            action="store_true",
            help="Generate embeddings and activate the imported version.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Extract and report metadata without writing files or database records.",
        )
        parser.add_argument(
            "--sample-characters",
            type=int,
            default=0,
            help="Include up to this many extracted characters in a dry-run report.",
        )

    def handle(self, *args, **options):
        source = Path(options["path"]).resolve()
        try:
            if options["dry_run"]:
                inspection = inspect_verified_markdown(
                    source,
                    sample_characters=max(0, options["sample_characters"]),
                )
                payload = {
                    "file": source.name,
                    "size_bytes": inspection.file_size,
                    "characters": inspection.character_count,
                    "blocks": inspection.block_count,
                    "chunks": inspection.chunk_count,
                    "sha256": inspection.sha256,
                }
                if inspection.sample_text:
                    payload["sample_text"] = inspection.sample_text
                self.stdout.write(json.dumps(payload, ensure_ascii=False))
                return

            if not options["confirm_reviewed"]:
                raise CommandError(
                    "Trusted import requires --confirm-reviewed after every fact "
                    "has been checked."
                )

            result = import_verified_markdown(
                source,
                source_key=options["source_key"],
                title=options["title"],
                embed=options["embed"],
            )
        except (MarkdownExtractionError, EmbeddingError, OSError) as exc:
            raise CommandError(str(exc)) from exc

        label = "DUPLICATE" if result.duplicate else "IMPORTED"
        self.stdout.write(
            self.style.SUCCESS(
                f"{label} {source.name} -> {result.version.document.title} "
                f"v{result.version.version_number} status={result.version.status} "
                f"chunks={result.version.chunks.count()} verified=yes"
            )
        )
