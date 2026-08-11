from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from zipfile import BadZipFile, ZipFile

from docx import Document as open_docx
from docx.table import Table
from docx.text.paragraph import Paragraph

from ..normalization import normalize_persian_text
from .pdf import ExtractedPage


MAX_ARCHIVE_ENTRIES = 2_048
MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024
MAX_COMPRESSION_RATIO = 1_000
UNSUPPORTED_PART_PREFIXES = (
    "word/activex/",
    "word/charts/",
    "word/comments",
    "word/diagrams/",
    "word/embeddings/",
    "word/endnotes",
    "word/footer",
    "word/footnotes",
    "word/glossary/",
    "word/header",
    "word/media/",
)
UNSUPPORTED_DOCUMENT_MARKERS = (
    b"alternatecontent",
    b"<w:altchunk",
    b"<w:customxml",
    b"<w:del",
    b"<w:drawing",
    b"<w:fldsimple",
    b"<w:ins",
    b"<w:instrtext",
    b"<w:movefrom",
    b"<w:moveto",
    b"<w:object",
    b"<w:pict",
    b"<w:sdt",
    b"<w:txbxcontent",
)


class DocxExtractionError(RuntimeError):
    pass


@dataclass(frozen=True)
class DocxExtractionResult:
    pages: tuple[ExtractedPage, ...]
    character_count: int
    block_count: int
    table_count: int


def _validate_archive(source, *, max_uncompressed_bytes):
    try:
        with ZipFile(source) as archive:
            members = archive.infolist()
            if not members or len(members) > MAX_ARCHIVE_ENTRIES:
                raise DocxExtractionError("The DOCX archive has an unsafe number of entries.")

            names = set()
            uncompressed_size = 0
            compressed_size = 0
            for member in members:
                normalized_name = member.filename.replace("\\", "/")
                archive_path = PurePosixPath(normalized_name)
                if archive_path.is_absolute() or ".." in archive_path.parts:
                    raise DocxExtractionError("The DOCX archive contains an unsafe path.")
                if member.flag_bits & 0x1:
                    raise DocxExtractionError("Encrypted DOCX archives are not supported.")
                names.add(normalized_name)
                uncompressed_size += member.file_size
                compressed_size += member.compress_size

            required_parts = {"[Content_Types].xml", "word/document.xml"}
            if not required_parts.issubset(names):
                raise DocxExtractionError("The file is not a valid Word document.")
            if uncompressed_size > max_uncompressed_bytes:
                raise DocxExtractionError("The expanded DOCX archive exceeds the safety limit.")
            if (
                compressed_size
                and uncompressed_size > 1024 * 1024
                and uncompressed_size / compressed_size > MAX_COMPRESSION_RATIO
            ):
                raise DocxExtractionError("The DOCX archive has an unsafe compression ratio.")

            content_types = archive.read("[Content_Types].xml").lower()
            if b"macroenabled" in content_types or any(
                name.casefold().endswith("vbaproject.bin") for name in names
            ):
                raise DocxExtractionError("Macro-enabled Word documents are not supported.")

            casefolded_names = {name.casefold() for name in names}
            if any(
                name.startswith(UNSUPPORTED_PART_PREFIXES) for name in casefolded_names
            ):
                raise DocxExtractionError(
                    "The DOCX contains content outside paragraphs and tables. "
                    "Move all reviewed knowledge into the document body before importing."
                )

            document_xml = archive.read("word/document.xml").lower()
            if any(marker in document_xml for marker in UNSUPPORTED_DOCUMENT_MARKERS):
                raise DocxExtractionError(
                    "The DOCX contains revisions, drawings, fields, or text boxes that "
                    "cannot be imported as trusted text."
                )
    except DocxExtractionError:
        raise
    except (BadZipFile, KeyError, OSError) as exc:
        raise DocxExtractionError("The DOCX file could not be opened or is malformed.") from exc


def _table_text(table):
    rows = []
    for row in table.rows:
        if any(cell.tables for cell in row.cells):
            raise DocxExtractionError(
                "Nested DOCX tables are not supported for trusted import."
            )
        cells = [normalize_persian_text(cell.text).replace("\n", " / ") for cell in row.cells]
        if any(cells):
            rows.append(" | ".join(cells))
    if not rows:
        return ""
    return "جدول:\n" + "\n".join(rows)


def extract_docx(path, *, max_uncompressed_bytes=MAX_UNCOMPRESSED_BYTES):
    source = Path(path)
    if source.suffix.casefold() != ".docx":
        raise DocxExtractionError("Only .docx Word files are supported.")

    _validate_archive(source, max_uncompressed_bytes=max_uncompressed_bytes)
    try:
        document = open_docx(source)
        blocks = []
        table_count = 0
        for item in document.iter_inner_content():
            if isinstance(item, Paragraph):
                text = normalize_persian_text(item.text)
            elif isinstance(item, Table):
                text = _table_text(item)
                table_count += bool(text)
            else:
                continue
            if text:
                blocks.append(text)
    except DocxExtractionError:
        raise
    except Exception as exc:
        raise DocxExtractionError("Word content extraction failed.") from exc

    content = normalize_persian_text("\n\n".join(blocks))
    if len(content) < 40:
        raise DocxExtractionError("The DOCX file does not contain enough usable text.")

    return DocxExtractionResult(
        pages=(ExtractedPage(page_number=1, text=content),),
        character_count=len(content),
        block_count=len(blocks),
        table_count=table_count,
    )
