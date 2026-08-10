from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.test import TestCase, override_settings

from apps.knowledge.extractors.pdf import ExtractedPage, PdfExtractionResult
from apps.knowledge.extractors import PdfExtractionError
from apps.knowledge.ingestion import import_pdf, inspect_pdf
from apps.knowledge.models import Document, DocumentVersion


def extraction_result(text):
    return PdfExtractionResult(
        pages=(ExtractedPage(page_number=1, text=text),),
        page_count=1,
        character_count=len(text),
        nonempty_page_count=1,
        needs_ocr=False,
        ocr_used=True,
    )


class DocumentIngestionTests(TestCase):
    def setUp(self):
        self.media = TemporaryDirectory()
        self.addCleanup(self.media.cleanup)
        self.settings_override = override_settings(MEDIA_ROOT=self.media.name)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        self.source_dir = TemporaryDirectory()
        self.addCleanup(self.source_dir.cleanup)
        self.path = Path(self.source_dir.name) / "Megatite S.pdf"

    @override_settings(KNOWLEDGE_MAX_FILE_BYTES=5)
    def test_rejects_pdf_over_configured_size_limit(self):
        self.path.write_bytes(b"123456")

        with self.assertRaises(PdfExtractionError):
            inspect_pdf(self.path)

    @patch("apps.knowledge.ingestion.create_embeddings")
    @patch("apps.knowledge.ingestion.extract_pdf")
    def test_import_is_versioned_deduplicated_and_activates_latest(self, extract_pdf, embeddings):
        embeddings.side_effect = lambda texts: [[0.1] * 1024 for _ in texts]

        self.path.write_bytes(b"first-pdf")
        extract_pdf.return_value = extraction_result("مشخصات فنی مگاتایت اس " * 50)
        first = import_pdf(self.path, embed=True, ocr=True)

        duplicate = import_pdf(self.path, embed=True, ocr=True)

        self.path.write_bytes(b"second-pdf")
        extract_pdf.return_value = extraction_result("نسخه جدید مشخصات مگاتایت اس " * 50)
        second = import_pdf(self.path, embed=True, ocr=True)

        self.assertTrue(first.created)
        self.assertTrue(duplicate.duplicate)
        self.assertFalse(second.duplicate)
        self.assertEqual(Document.objects.count(), 1)
        self.assertEqual(DocumentVersion.objects.count(), 2)
        first.version.refresh_from_db()
        second.version.refresh_from_db()
        self.assertFalse(first.version.is_active)
        self.assertTrue(second.version.is_active)
        self.assertEqual(second.version.status, DocumentVersion.Status.READY)
        self.assertTrue(second.version.ocr_used)
