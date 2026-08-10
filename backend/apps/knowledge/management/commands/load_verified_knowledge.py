from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from apps.knowledge.embeddings import EmbeddingError
from apps.knowledge.extractors import PdfExtractionError
from apps.knowledge.verified import import_verified_manifest


class Command(BaseCommand):
    help = "Load reviewed, checksum-bound knowledge manifests shipped with the application."

    def add_arguments(self, parser):
        parser.add_argument(
            "--manifest",
            help="Load one manifest filename from apps/knowledge/verified instead of all manifests.",
        )
        parser.add_argument(
            "--embed",
            action="store_true",
            help="Generate embeddings and activate successfully indexed verified knowledge.",
        )

    def handle(self, *args, **options):
        verified_directory = Path(__file__).resolve().parents[2] / "verified"
        if options["manifest"]:
            manifest_name = Path(options["manifest"]).name
            manifests = [verified_directory / manifest_name]
        else:
            manifests = sorted(verified_directory.glob("*.json"))

        if not manifests or any(not path.is_file() for path in manifests):
            raise CommandError("No matching verified knowledge manifests were found.")

        failures = 0
        for manifest in manifests:
            try:
                result = import_verified_manifest(manifest, embed=options["embed"])
                label = "DUPLICATE" if result.duplicate else "IMPORTED"
                self.stdout.write(
                    self.style.SUCCESS(
                        f"{label} {manifest.name} -> {result.version.document.title} "
                        f"status={result.version.status} chunks={result.version.chunks.count()}"
                    )
                )
            except (PdfExtractionError, EmbeddingError, OSError) as exc:
                failures += 1
                self.stderr.write(self.style.ERROR(f"FAILED {manifest.name}: {exc}"))

        if failures:
            raise CommandError(f"{failures} verified manifest(s) failed.")
