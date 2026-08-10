from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.test import TestCase, override_settings

from apps.knowledge.models import DocumentChunk, DocumentVersion
from apps.knowledge.verified import import_verified_manifest


class VerifiedKnowledgeTests(TestCase):
    def setUp(self):
        self.media = TemporaryDirectory()
        self.addCleanup(self.media.cleanup)
        self.settings_override = override_settings(MEDIA_ROOT=self.media.name)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)

    @patch("apps.knowledge.ingestion.create_embeddings")
    def test_imports_traceable_verified_values_and_activates_them(self, embeddings):
        embeddings.side_effect = lambda texts: [[0.1] * 1024 for _ in texts]
        manifest = (
            Path(__file__).resolve().parents[1]
            / "verified"
            / "megatite_s_fa.json"
        )

        result = import_verified_manifest(manifest, embed=True)

        self.assertTrue(result.created)
        self.assertTrue(result.version.content_verified)
        self.assertFalse(result.version.ocr_used)
        self.assertTrue(result.version.is_active)
        self.assertEqual(result.version.status, DocumentVersion.Status.READY)
        content = "\n".join(DocumentChunk.objects.values_list("content", flat=True))
        self.assertIn("در دمای 10 درجه سانتی‌گراد: 48 ساعت", content)

        duplicate = import_verified_manifest(manifest, embed=True)
        self.assertTrue(duplicate.duplicate)
        self.assertEqual(DocumentVersion.objects.count(), 1)
