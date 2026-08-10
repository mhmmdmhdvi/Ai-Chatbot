from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from apps.knowledge.chunking import chunk_page_text
from apps.knowledge.extractors.pdf import ExtractedPage, extract_pdf
from apps.knowledge.normalization import normalize_persian_text, normalize_source_key


class PersianNormalizationTests(SimpleTestCase):
    def test_normalizes_arabic_letters_digits_and_direction_marks(self):
        value = "\u200fكالا يک ۱۲٣\r\n  مگاتایت\t"

        self.assertEqual(normalize_persian_text(value), "کالا یک 123\nمگاتایت")

    def test_source_key_is_stable_for_spacing_and_case(self):
        self.assertEqual(normalize_source_key("  MEGATITE   S_ "), "megatite s")


class ChunkingTests(SimpleTestCase):
    def test_chunks_keep_page_and_overlap(self):
        text = " ".join(
            f"پاراگراف شماره {index} برای مگاتایت." for index in range(100)
        )

        chunks = chunk_page_text(
            text,
            page_number=7,
            max_characters=500,
            overlap_characters=80,
        )

        self.assertGreater(len(chunks), 1)
        self.assertTrue(all(chunk.page_number == 7 for chunk in chunks))
        self.assertEqual([chunk.chunk_index for chunk in chunks], list(range(len(chunks))))
        self.assertEqual(len({chunk.content_hash for chunk in chunks}), len(chunks))


class PdfExtractionTests(SimpleTestCase):
    @patch("apps.knowledge.extractors.pdf._ocr_pages")
    @patch("apps.knowledge.extractors.pdf.PdfReader")
    def test_empty_scanned_pdf_uses_ocr_only_when_allowed(self, reader_class, ocr_pages):
        page = MagicMock()
        page.extract_text.return_value = ""
        reader_class.return_value.is_encrypted = False
        reader_class.return_value.pages = [page]
        ocr_pages.return_value = [ExtractedPage(page_number=1, text="متن فارسی بازیابی شده")]

        without_ocr = extract_pdf("sample.pdf", allow_ocr=False)
        with_ocr = extract_pdf("sample.pdf", allow_ocr=True)

        self.assertTrue(without_ocr.needs_ocr)
        self.assertFalse(without_ocr.ocr_used)
        self.assertTrue(with_ocr.ocr_used)
        self.assertEqual(with_ocr.pages[0].text, "متن فارسی بازیابی شده")
