from dataclasses import dataclass
from pathlib import Path

import pypdfium2 as pdfium
from pypdf import PdfReader
from pypdf.errors import PdfReadError
import pytesseract

from ..normalization import normalize_persian_text


class PdfExtractionError(RuntimeError):
    pass


@dataclass(frozen=True)
class ExtractedPage:
    page_number: int
    text: str


@dataclass(frozen=True)
class PdfExtractionResult:
    pages: tuple[ExtractedPage, ...]
    page_count: int
    character_count: int
    nonempty_page_count: int
    needs_ocr: bool
    ocr_used: bool


def _quality_metrics(pages):
    page_count = len(pages)
    character_count = sum(len(page.text) for page in pages)
    nonempty_page_count = sum(1 for page in pages if len(page.text) >= 40)
    minimum_expected_characters = max(120, page_count * 50)
    minimum_expected_pages = max(1, round(page_count * 0.5))
    needs_ocr = (
        page_count == 0
        or character_count < minimum_expected_characters
        or nonempty_page_count < minimum_expected_pages
    )
    return character_count, nonempty_page_count, needs_ocr


def _ocr_pages(path):
    pages = []
    document = None
    try:
        document = pdfium.PdfDocument(path)
        for page_number in range(len(document)):
            page = None
            bitmap = None
            image = None
            try:
                page = document[page_number]
                bitmap = page.render(scale=4.0, rev_byteorder=True)
                image = bitmap.to_pil()
                raw_text = pytesseract.image_to_string(
                    image,
                    lang="fas+eng",
                    config="--oem 1 --psm 3",
                    timeout=120,
                )
                pages.append(
                    ExtractedPage(
                        page_number=page_number + 1,
                        text=normalize_persian_text(raw_text),
                    )
                )
            finally:
                if image is not None:
                    image.close()
                if bitmap is not None:
                    bitmap.close()
                if page is not None:
                    page.close()
    except Exception as exc:
        raise PdfExtractionError("Persian OCR failed while processing the PDF.") from exc
    finally:
        if document is not None:
            document.close()
    return pages


def extract_pdf(path, *, allow_ocr=False):
    source = Path(path)
    if source.suffix.lower() != ".pdf":
        raise PdfExtractionError("Only PDF files are supported.")

    try:
        reader = PdfReader(source, strict=False)
        if reader.is_encrypted and reader.decrypt("") == 0:
            raise PdfExtractionError("The PDF is encrypted and requires a password.")

        pages = []
        for page_number, page in enumerate(reader.pages, start=1):
            try:
                raw_text = page.extract_text() or ""
            except Exception as exc:
                raise PdfExtractionError(f"Text extraction failed on page {page_number}.") from exc
            pages.append(ExtractedPage(page_number=page_number, text=normalize_persian_text(raw_text)))
    except PdfExtractionError:
        raise
    except (PdfReadError, OSError, ValueError) as exc:
        raise PdfExtractionError("The PDF could not be opened or is malformed.") from exc

    page_count = len(pages)
    character_count, nonempty_page_count, needs_ocr = _quality_metrics(pages)
    ocr_used = False
    if needs_ocr and allow_ocr:
        pages = _ocr_pages(source)
        page_count = len(pages)
        character_count, nonempty_page_count, needs_ocr = _quality_metrics(pages)
        ocr_used = True

    return PdfExtractionResult(
        pages=tuple(pages),
        page_count=page_count,
        character_count=character_count,
        nonempty_page_count=nonempty_page_count,
        needs_ocr=needs_ocr,
        ocr_used=ocr_used,
    )
