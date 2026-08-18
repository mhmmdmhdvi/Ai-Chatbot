from dataclasses import dataclass
from pathlib import Path

from ..normalization import normalize_persian_text
from .pdf import ExtractedPage


class MarkdownExtractionError(RuntimeError):
    pass


@dataclass(frozen=True)
class MarkdownExtractionResult:
    pages: tuple[ExtractedPage, ...]
    character_count: int
    block_count: int


def extract_markdown(path, *, max_bytes):
    source = Path(path)
    if source.suffix.casefold() not in {".md", ".markdown"}:
        raise MarkdownExtractionError("Only Markdown files are supported.")
    if not source.is_file():
        raise MarkdownExtractionError("The Markdown file does not exist or is not a regular file.")
    file_size = source.stat().st_size
    if file_size == 0:
        raise MarkdownExtractionError("The Markdown file is empty.")
    if file_size > max_bytes:
        raise MarkdownExtractionError("The Markdown file exceeds the configured size limit.")

    try:
        content = normalize_persian_text(source.read_text(encoding="utf-8"))
    except UnicodeDecodeError as exc:
        raise MarkdownExtractionError("The Markdown file must be valid UTF-8.") from exc
    except OSError as exc:
        raise MarkdownExtractionError("The Markdown file could not be opened.") from exc

    blocks = [block.strip() for block in content.split("\n\n") if block.strip()]
    content = normalize_persian_text("\n\n".join(blocks))
    if len(content) < 40:
        raise MarkdownExtractionError("The Markdown file does not contain enough usable text.")

    return MarkdownExtractionResult(
        pages=(ExtractedPage(page_number=1, text=content),),
        character_count=len(content),
        block_count=len(blocks),
    )
