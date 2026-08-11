import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import SimpleTestCase, override_settings
from pypdf import PdfWriter

from apps.knowledge.vision_extraction import (
    _numeric_fact_signatures,
    extract_pdf_with_vision,
)


def vision_response(payload, *, response_id="response-vision", input_tokens=100, output_tokens=50):
    return SimpleNamespace(
        id=response_id,
        model="test-vision-model",
        status="completed",
        output_text=json.dumps(payload, ensure_ascii=False),
        usage=SimpleNamespace(input_tokens=input_tokens, output_tokens=output_tokens),
    )


@override_settings(
    OPENAI_API_KEY="test-key",
    OPENAI_DOCUMENT_EXTRACTION_MODEL="test-vision-model",
    OPENAI_DOCUMENT_TIMEOUT_SECONDS=300,
    OPENAI_DOCUMENT_MAX_OUTPUT_TOKENS=30_000,
    KNOWLEDGE_MAX_FILE_BYTES=50 * 1024 * 1024,
)
class VisionExtractionTests(SimpleTestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def create_pdf(self, page_count=2):
        source = self.root / "Megatite Test.pdf"
        writer = PdfWriter()
        for _ in range(page_count):
            writer.add_blank_page(width=595, height=842)
        with source.open("wb") as destination:
            writer.write(destination)
        return source

    def test_equivalent_minus_glyphs_do_not_create_false_numeric_disagreement(self):
        common = {
            "label": "ضریب انبساط خطی",
            "unit": "میلیمتر / میلیمتر / درجه سانتی‌گراد",
            "context": "خصوصیات پس از پخت کامل",
        }

        self.assertEqual(
            _numeric_fact_signatures([{**common, "value": "60*10−6"}]),
            _numeric_fact_signatures([{**common, "value": "60*10-6"}]),
        )

    @patch("apps.knowledge.vision_extraction.OpenAI")
    def test_two_pass_extraction_writes_traceable_trusted_manifest(self, openai_class):
        source = self.create_pdf()
        payload = {
            "document_title": "دیتاشیت Megatite Test",
            "product_names": ["Megatite Test"],
            "pages": [
                {
                    "page_number": 1,
                    "content": "Megatite Test چسب صنعتی دو جزئی برای کاربردهای ساختمانی است.",
                    "numeric_facts": [],
                    "uncertain_items": [],
                },
                {
                    "page_number": 2,
                    "content": "حداقل زمان پخت اولیه در دمای 25 درجه سانتی‌گراد 12 ساعت است.",
                    "numeric_facts": [
                        {
                            "label": "حداقل زمان پخت اولیه",
                            "value": "12",
                            "unit": "ساعت",
                            "context": "در دمای 25 درجه سانتی‌گراد",
                        },
                        {
                            "label": "دمای پخت",
                            "value": "25",
                            "unit": "درجه سانتی‌گراد",
                            "context": "حداقل زمان پخت اولیه 12 ساعت",
                        },
                    ],
                    "uncertain_items": [],
                },
            ],
        }
        client = Mock()
        client.responses.create.side_effect = [
            vision_response(payload, response_id="pass-1"),
            vision_response(payload, response_id="pass-2"),
        ]
        openai_class.return_value = client

        result = extract_pdf_with_vision(source, output_dir=self.root / "output")

        self.assertEqual(result.page_count, 2)
        self.assertEqual(result.trusted_page_count, 2)
        self.assertEqual(result.review_page_count, 0)
        self.assertEqual(result.input_tokens, 200)
        self.assertEqual(result.output_tokens, 100)
        self.assertTrue(result.report_path.is_file())
        self.assertTrue(result.manifest_path.is_file())
        manifest = json.loads(result.manifest_path.read_text(encoding="utf-8"))
        self.assertEqual(manifest["source_filename"], source.name)
        self.assertEqual(len(manifest["source_sha256"]), 64)
        self.assertEqual([entry["page_number"] for entry in manifest["entries"]], [1, 2])

        self.assertEqual(client.responses.create.call_count, 2)
        request = client.responses.create.call_args_list[0].kwargs
        self.assertEqual(request["model"], "test-vision-model")
        self.assertFalse(request["store"])
        self.assertEqual(request["max_output_tokens"], 30_000)
        file_input = request["input"][0]["content"][0]
        self.assertEqual(file_input["type"], "input_file")
        self.assertEqual(file_input["detail"], "high")
        self.assertTrue(file_input["file_data"].startswith("data:application/pdf;base64,"))

        client.responses.create.reset_mock()
        reused = extract_pdf_with_vision(source, output_dir=self.root / "output")
        self.assertTrue(reused.reused)
        client.responses.create.assert_not_called()

    @patch("apps.knowledge.vision_extraction.OpenAI")
    def test_numeric_disagreement_is_preserved_for_review_but_not_activated(self, openai_class):
        source = self.create_pdf(page_count=1)
        first = {
            "document_title": "Megatite Test",
            "product_names": ["Megatite Test"],
            "pages": [
                {
                    "page_number": 1,
                    "content": "حداقل زمان پخت اولیه در دمای 25 درجه سانتی‌گراد 12 ساعت است.",
                    "numeric_facts": [
                        {
                            "label": "حداقل زمان پخت اولیه",
                            "value": "12",
                            "unit": "ساعت",
                            "context": "در دمای 25 درجه سانتی‌گراد",
                        }
                    ],
                    "uncertain_items": [],
                }
            ],
        }
        second = {
            **first,
            "pages": [
                {
                    "page_number": 1,
                    "content": "حداقل زمان پخت اولیه در دمای 25 درجه سانتی‌گراد 18 ساعت است.",
                    "numeric_facts": [
                        {
                            "label": "حداقل زمان پخت اولیه",
                            "value": "18",
                            "unit": "ساعت",
                            "context": "در دمای 25 درجه سانتی‌گراد",
                        }
                    ],
                    "uncertain_items": [],
                }
            ],
        }
        client = Mock()
        client.responses.create.side_effect = [vision_response(first), vision_response(second)]
        openai_class.return_value = client

        result = extract_pdf_with_vision(source, output_dir=self.root / "output")

        self.assertEqual(result.trusted_page_count, 0)
        self.assertEqual(result.review_page_count, 1)
        self.assertIsNone(result.manifest_path)
        report = json.loads(result.report_path.read_text(encoding="utf-8"))
        self.assertFalse(report["pages"][0]["trusted"])
        self.assertIn(
            "different technical numeric facts",
            report["pages"][0]["review_items"][0],
        )
        self.assertEqual(
            report["pages"][0]["numeric_fact_difference"],
            {
                "first_pass_only": [
                    {
                        "label": "حداقلزمانپختاولیه",
                        "value": "12",
                        "unit": "ساعت",
                        "context": "دردمای25درجهسانتیگراد",
                    }
                ],
                "final_pass_only": [
                    {
                        "label": "حداقلزمانپختاولیه",
                        "value": "18",
                        "unit": "ساعت",
                        "context": "دردمای25درجهسانتیگراد",
                    }
                ],
            },
        )
