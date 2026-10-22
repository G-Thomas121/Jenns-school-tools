"""
Bringing Jenn's own files into the workspace: single files or whole folders (say, 20 PDFs
downloaded from Google Drive), either into curriculum/ or into one lesson's sources/ folder.

Each upload folder gets an _index.md with a one-line summary per file, so MARTY can see
what's there and open only what it needs instead of reading everything. Summaries come
from a small, fast model and are written once per file, not on every chat turn.
"""
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from anthropic import Anthropic

from app.services.workspace import SOURCES_DIR, Workspace

SUPPORTED_UPLOADS = {".pdf", ".docx", ".txt", ".md"}
INDEX_FILE = "_index.md"
SUMMARY_MODEL = "claude-haiku-4-5"
SUMMARY_EXCERPT_CHARS = 8_000
MIN_CHARS_PER_PAGE = 50  # below this a PDF is almost certainly scanned images, not text
NO_SUMMARY = "(no summary yet)"
SCANNED = ("⚠️ Little or no text could be pulled from this PDF — it's probably scanned pages. "
           "Ask Jenn what it covers rather than relying on it.")

_ENTRY = re.compile(r"^- `(.+?)`(?: \(\d+ pages?\))? — (.*)$")
_PAGE = re.compile(r"^--- Page \d+ ---$", re.MULTILINE)


class UploadError(Exception):
    pass


def summarize(name: str, text: str) -> str:
    """One sentence on what a file is and what it's useful for."""
    response = Anthropic().messages.create(
        model=SUMMARY_MODEL,
        max_tokens=200,
        messages=[{"role": "user", "content": (
            "This file is teaching material a high school English teacher uploaded. In one sentence "
            "of at most 30 words, say what it is and what it covers (text, chapter or canto, skill, "
            "type of handout). Reply with only the sentence.\n\n"
            f"<file name=\"{name}\">\n{text}\n</file>"
        )}],
    )
    return " ".join(b.text for b in response.content if b.type == "text").strip()


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def import_files(ws: Workspace, uploads: list[tuple[str, bytes]], lesson: str | None = None) -> dict:
    """Save uploads (relative path as the browser sent it, bytes) and refresh the indexes.
    With a lesson, files go in lessons/<slug>/sources/ without the picked folder's own name;
    otherwise in curriculum/, keeping it."""
    if lesson is not None:
        slug = slugify(lesson)
        if not slug:
            raise UploadError("Lesson name needs at least one letter or number")
        dest = f"lessons/{slug}/{SOURCES_DIR}"
    else:
        dest = "curriculum"

    saved, skipped, index_dirs = [], [], []
    for name, data in uploads:
        parts = [p for p in name.replace("\\", "/").split("/") if p not in ("", ".", "..")]
        if not parts or any(p.startswith(".") or p == "__MACOSX" for p in parts):
            continue
        if Path(parts[-1]).suffix.lower() not in SUPPORTED_UPLOADS:
            skipped.append(name)
            continue
        if lesson is not None and len(parts) > 1:
            parts = parts[1:]
        rel = "/".join([dest, *parts])
        path = ws._resolve(rel)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        saved.append(rel)
        folder = dest if lesson is not None or len(parts) == 1 else f"{dest}/{parts[0]}"
        if folder not in index_dirs:
            index_dirs.append(folder)

    if not saved:
        raise UploadError(f"No supported files to upload. Accepted: {', '.join(sorted(SUPPORTED_UPLOADS))}")

    flagged = []
    for folder in index_dirs:
        flagged += _update_index(ws, folder, fresh=set(saved))
    return {
        "saved": saved,
        "skipped": skipped,
        "flagged": flagged,
        "indexes": [f"{folder}/{INDEX_FILE}" for folder in index_dirs],
    }


def _indexed_files(ws: Workspace, folder: str) -> list[str]:
    """Files under folder, minus index files and subfolders that keep their own index."""
    own = {str(Path(f).parent) for f in ws.list_files() if f.endswith(f"/{INDEX_FILE}")} - {folder}
    files = []
    for f in ws.list_files():
        if not f.startswith(f"{folder}/") or Path(f).name in (INDEX_FILE, ".gitkeep"):
            continue
        if any(f.startswith(f"{d}/") for d in own):
            continue
        files.append(f)
    return files


def _update_index(ws: Workspace, folder: str, fresh: set[str]) -> list[str]:
    """Rewrite folder/_index.md, summarizing new or replaced files and keeping the rest.
    Returns the files flagged as scanned."""
    index_path = ws._resolve(f"{folder}/{INDEX_FILE}")
    old = {}
    if index_path.is_file():
        for line in index_path.read_text(encoding="utf-8").splitlines():
            m = _ENTRY.match(line)
            if m:
                old[m.group(1)] = m.group(2)

    entries, flagged, todo = {}, [], {}
    for rel in _indexed_files(ws, folder):
        name = rel[len(folder) + 1:]
        text = ws.read(rel)
        pages = len(_PAGE.findall(text))
        label = f"`{name}`" + (f" ({pages} page{'s' if pages != 1 else ''})" if pages else "")
        if pages and len(_PAGE.sub("", text).strip()) < MIN_CHARS_PER_PAGE * pages:
            entries[name] = (label, SCANNED)
            flagged.append(rel)
        elif rel not in fresh and name in old:
            entries[name] = (label, old[name])
        else:
            entries[name] = (label, None)
            todo[name] = text[:SUMMARY_EXCERPT_CHARS]

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {name: pool.submit(_safe_summary, name, text) for name, text in todo.items()}
    for name, future in futures.items():
        entries[name] = (entries[name][0], future.result())

    lines = [f"- {label} — {summary}" for label, summary in entries.values()]
    index_path.write_text(
        f"# Files in {folder}/\n\n"
        "Jenn uploaded these. Each line says what the file is, so you can open just the ones you need.\n\n"
        + "\n".join(lines) + "\n",
        encoding="utf-8",
    )
    return flagged


def _safe_summary(name: str, text: str) -> str:
    try:
        return " ".join(summarize(Path(name).name, text).split()) or NO_SUMMARY
    except Exception:
        return NO_SUMMARY
