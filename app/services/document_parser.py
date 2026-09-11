from pathlib import Path

MAX_CHARS_PER_DOC = 60_000


def parse_document(filepath: str) -> str:
    path = Path(filepath)
    if not path.exists():
        return f"[File not found: {path.name}]"

    suffix = path.suffix.lower()

    if suffix == ".txt" or suffix == ".md":
        text = path.read_text(encoding="utf-8", errors="ignore")

    elif suffix == ".pdf":
        try:
            from pypdf import PdfReader
            reader = PdfReader(str(path))
            pages = [page.extract_text() or "" for page in reader.pages]
            text = "\n\n".join(pages)
        except Exception as e:
            return f"[Could not parse PDF {path.name}: {e}]"

    elif suffix == ".docx":
        try:
            from docx import Document
            doc = Document(str(path))
            paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
            text = "\n\n".join(paragraphs)
        except Exception as e:
            return f"[Could not parse DOCX {path.name}: {e}]"

    else:
        return f"[Unsupported file type: {suffix}]"

    if len(text) > MAX_CHARS_PER_DOC:
        text = text[:MAX_CHARS_PER_DOC] + f"\n\n[...truncated at {MAX_CHARS_PER_DOC} characters]"

    return text.strip()
