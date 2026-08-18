from pathlib import Path
from tempfile import NamedTemporaryFile
from xml.etree import ElementTree
from zipfile import ZIP_DEFLATED, ZipFile


def strip_unsupported_package_parts(path):
    """Remove python-docx template extras from a trusted-import test fixture."""

    source = Path(path)
    with ZipFile(source) as archive:
        entries = {
            info.filename: archive.read(info)
            for info in archive.infolist()
            if not _is_unsupported_part(info.filename)
        }

    for name, content in tuple(entries.items()):
        if name.casefold().endswith(".rels"):
            entries[name] = _without_unsupported_relationships(content)
        elif name == "[Content_Types].xml":
            entries[name] = _without_unsupported_content_types(content)

    with NamedTemporaryFile(
        dir=source.parent,
        prefix=f"{source.stem}-",
        suffix=".docx",
        delete=False,
    ) as temporary:
        temporary_path = Path(temporary.name)

    try:
        with ZipFile(temporary_path, "w", compression=ZIP_DEFLATED) as archive:
            for name, content in entries.items():
                archive.writestr(name, content)
        temporary_path.replace(source)
    finally:
        temporary_path.unlink(missing_ok=True)


def _is_unsupported_part(name):
    normalized = name.casefold()
    return normalized.startswith("customxml/") or normalized.startswith(
        "docprops/thumbnail"
    )


def _without_unsupported_relationships(content):
    root = ElementTree.fromstring(content)
    for relationship in list(root):
        target = relationship.attrib.get("Target", "").casefold()
        if "customxml" in target or "thumbnail" in target:
            root.remove(relationship)
    return ElementTree.tostring(root, encoding="utf-8", xml_declaration=True)


def _without_unsupported_content_types(content):
    root = ElementTree.fromstring(content)
    for item in list(root):
        part_name = item.attrib.get("PartName", "").casefold()
        extension = item.attrib.get("Extension", "").casefold()
        if (
            "customxml" in part_name
            or "thumbnail" in part_name
            or extension in {"jpeg", "jpg"}
        ):
            root.remove(item)
    return ElementTree.tostring(root, encoding="utf-8", xml_declaration=True)
