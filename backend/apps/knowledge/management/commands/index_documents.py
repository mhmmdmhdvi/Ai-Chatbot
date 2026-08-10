from uuid import UUID

from django.core.management.base import BaseCommand, CommandError

from apps.knowledge.embeddings import EmbeddingError
from apps.knowledge.ingestion import index_document_version
from apps.knowledge.models import DocumentVersion


class Command(BaseCommand):
    help = "Generate embeddings for extracted document versions and activate successful versions."

    def add_arguments(self, parser):
        selection = parser.add_mutually_exclusive_group(required=True)
        selection.add_argument("--version", help="UUID of one document version to index.")
        selection.add_argument(
            "--all-pending",
            action="store_true",
            help="Index every pending or previously failed version that has extracted chunks.",
        )

    def handle(self, *args, **options):
        if options["version"]:
            try:
                version_id = UUID(options["version"])
            except ValueError as exc:
                raise CommandError("--version must be a valid UUID.") from exc
            versions = DocumentVersion.objects.filter(pk=version_id)
        else:
            versions = DocumentVersion.objects.filter(
                status__in=(DocumentVersion.Status.PENDING, DocumentVersion.Status.FAILED),
                chunks__isnull=False,
            ).distinct()

        versions = list(versions.select_related("document").order_by("created_at"))
        if not versions:
            raise CommandError("No matching document versions were found.")

        failures = 0
        for version in versions:
            try:
                index_document_version(version)
                self.stdout.write(
                    self.style.SUCCESS(
                        f"INDEXED {version.document.title} v{version.version_number} "
                        f"chunks={version.chunks.count()}"
                    )
                )
            except EmbeddingError as exc:
                failures += 1
                self.stderr.write(
                    self.style.ERROR(
                        f"FAILED {version.document.title} v{version.version_number}: {exc}"
                    )
                )

        if failures:
            raise CommandError(f"{failures} document version(s) failed to index.")
