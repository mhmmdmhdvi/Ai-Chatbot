from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from apps.knowledge.models import DocumentChunk, DocumentVersion
from apps.knowledge.verified import import_verified_markdown


class VerifiedMarkdownTests(TestCase):
    def setUp(self):
        self.media = TemporaryDirectory()
        self.addCleanup(self.media.cleanup)
        self.settings_override = override_settings(MEDIA_ROOT=self.media.name)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        self.source_directory = TemporaryDirectory()
        self.addCleanup(self.source_directory.cleanup)
        self.path = Path(self.source_directory.name) / "advisor.md"

    def _write_guide(self, *, label="اول"):
        self.path.write_text(
            "# راهنمای مشاور مگاتایت\n\n"
            f"نسخه {label}: ابتدا کاربرد مشتری را بفهم و سپس محصول مناسب را پیشنهاد بده.\n\n"
            "دیتاشیت VERIFIED اختصاصی محصول برای عددهای دقیق مقدم است.\n",
            encoding="utf-8",
        )

    @patch("apps.knowledge.ingestion.create_embeddings")
    def test_imports_verified_markdown_deduplicates_and_activates_new_version(self, embeddings):
        embeddings.side_effect = lambda texts: [[0.1] * 1024 for _ in texts]
        self._write_guide()

        first = import_verified_markdown(
            self.path,
            source_key="verified:megatite-ai-advisor-guide-fa",
            title="Megatite AI Advisor Guide",
            embed=True,
        )
        duplicate = import_verified_markdown(
            self.path,
            source_key="verified:megatite-ai-advisor-guide-fa",
            embed=True,
        )

        self.assertTrue(first.created)
        self.assertTrue(duplicate.duplicate)
        self.assertTrue(first.version.content_verified)
        self.assertTrue(first.version.is_active)
        self.assertEqual(first.version.status, DocumentVersion.Status.READY)
        self.assertEqual(first.version.original_filename, "advisor.md")
        content = "\n".join(DocumentChunk.objects.values_list("content", flat=True))
        self.assertIn("دیتاشیت VERIFIED", content)

        self._write_guide(label="دوم")
        second = import_verified_markdown(
            self.path,
            source_key="verified:megatite-ai-advisor-guide-fa",
            embed=True,
        )
        first.version.refresh_from_db()
        second.version.refresh_from_db()
        self.assertFalse(first.version.is_active)
        self.assertTrue(second.version.is_active)
        self.assertEqual(second.version.version_number, 2)

    def test_command_requires_explicit_review_confirmation(self):
        self._write_guide()

        with self.assertRaises(CommandError):
            call_command("import_verified_markdown", str(self.path), stdout=StringIO())

    def test_command_can_safely_dry_run_without_confirmation(self):
        self._write_guide()
        output = StringIO()

        call_command(
            "import_verified_markdown",
            str(self.path),
            dry_run=True,
            sample_characters=100,
            stdout=output,
        )

        self.assertIn('"chunks": 1', output.getvalue())
        self.assertEqual(DocumentVersion.objects.count(), 0)
