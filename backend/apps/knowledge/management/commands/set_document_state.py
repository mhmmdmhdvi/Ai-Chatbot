from uuid import UUID

from django.core.management.base import BaseCommand, CommandError

from apps.knowledge.ingestion import activate_document_version, deactivate_document
from apps.knowledge.models import Document, DocumentVersion


class Command(BaseCommand):
    help = "Activate a ready document version (rollback) or deactivate a document."

    def add_arguments(self, parser):
        action = parser.add_mutually_exclusive_group(required=True)
        action.add_argument("--activate-version", help="UUID of a ready version to activate.")
        action.add_argument("--deactivate-document", help="Source key of a document to deactivate.")

    def handle(self, *args, **options):
        if options["activate_version"]:
            try:
                version_id = UUID(options["activate_version"])
            except ValueError as exc:
                raise CommandError("--activate-version must be a valid UUID.") from exc
            try:
                version = DocumentVersion.objects.select_related("document").get(pk=version_id)
                activate_document_version(version)
            except DocumentVersion.DoesNotExist as exc:
                raise CommandError("Document version was not found.") from exc
            except ValueError as exc:
                raise CommandError(str(exc)) from exc
            self.stdout.write(
                self.style.SUCCESS(
                    f"ACTIVATED {version.document.title} v{version.version_number}"
                )
            )
            return

        try:
            document = Document.objects.get(source_key=options["deactivate_document"])
        except Document.DoesNotExist as exc:
            raise CommandError("Document was not found.") from exc
        deactivate_document(document)
        self.stdout.write(self.style.SUCCESS(f"DEACTIVATED {document.title}"))
