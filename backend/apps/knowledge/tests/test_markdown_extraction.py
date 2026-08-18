from pathlib import Path
from tempfile import TemporaryDirectory

from django.test import SimpleTestCase

from apps.knowledge.extractors.markdown import MarkdownExtractionError, extract_markdown


class MarkdownExtractionTests(SimpleTestCase):
    def setUp(self):
        self.directory = TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "advisor.md"

    def test_extracts_utf8_markdown_blocks(self):
        self.path.write_text(
            "# راهنمای مشاور مگاتایت\n\n"
            "مشاور باید ابتدا کاربرد مشتری را بفهمد.\n\n"
            "- فقط یک سؤال کوتاه بپرس.\n"
            "- دیتاشیت محصول برای عددهای دقیق مقدم است.\n",
            encoding="utf-8",
        )

        result = extract_markdown(self.path, max_bytes=10_000)

        self.assertEqual(result.block_count, 3)
        self.assertEqual(result.pages[0].page_number, 1)
        self.assertIn("دیتاشیت محصول", result.pages[0].text)

    def test_rejects_non_utf8_markdown(self):
        self.path.write_bytes(b"\xff\xfe\x00\x00")

        with self.assertRaises(MarkdownExtractionError):
            extract_markdown(self.path, max_bytes=10_000)

    def test_rejects_unsupported_suffix(self):
        source = self.path.with_suffix(".txt")
        source.write_text("valid but unsupported", encoding="utf-8")

        with self.assertRaises(MarkdownExtractionError):
            extract_markdown(source, max_bytes=10_000)
