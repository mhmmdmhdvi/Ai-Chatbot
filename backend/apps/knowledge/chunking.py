from dataclasses import dataclass
from hashlib import sha256


DEFAULT_CHUNK_CHARACTERS = 2400
DEFAULT_OVERLAP_CHARACTERS = 300


@dataclass(frozen=True)
class TextChunk:
    page_number: int
    chunk_index: int
    content: str
    content_hash: str


def _find_chunk_end(text, start, target_end):
    if target_end >= len(text):
        return len(text)

    minimum_end = start + int((target_end - start) * 0.6)
    for separator in ("\n\n", "\n", ". ", "، ", " "):
        position = text.rfind(separator, minimum_end, target_end)
        if position != -1:
            return position + len(separator)
    return target_end


def chunk_page_text(
    text,
    *,
    page_number,
    max_characters=DEFAULT_CHUNK_CHARACTERS,
    overlap_characters=DEFAULT_OVERLAP_CHARACTERS,
):
    if max_characters < 500:
        raise ValueError("max_characters must be at least 500")
    if overlap_characters < 0 or overlap_characters >= max_characters:
        raise ValueError("overlap_characters must be between 0 and max_characters")

    chunks = []
    start = 0
    chunk_index = 0
    while start < len(text):
        target_end = min(len(text), start + max_characters)
        end = _find_chunk_end(text, start, target_end)
        content = text[start:end].strip()
        if content:
            chunks.append(
                TextChunk(
                    page_number=page_number,
                    chunk_index=chunk_index,
                    content=content,
                    content_hash=sha256(content.encode("utf-8")).hexdigest(),
                )
            )
            chunk_index += 1

        if end >= len(text):
            break

        next_start = max(start + 1, end - overlap_characters)
        while next_start < end and not text[next_start].isspace():
            next_start += 1
        start = next_start

    return chunks


def chunk_pages(pages):
    chunks = []
    for page in pages:
        chunks.extend(chunk_page_text(page.text, page_number=page.page_number))
    return chunks
