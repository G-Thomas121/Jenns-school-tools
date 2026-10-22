"""
Jenn's workspace: a git-backed folder of markdown files that MARTY reads and edits,
the way a coding agent works in a repo.

    MARTY.md       memory — preferences and notes MARTY carries between chats
    curriculum/    Jenn's uploaded reference docs (read-only to MARTY)
    lessons/       lesson plans, worksheets, foldables, slide outlines (.md); each lesson's
                   sources/ folder holds files Jenn uploaded for it (read-only to MARTY)

Text pulled out of PDFs and DOCX files is cached in .cache/ (git-ignored) so searching a
folder of PDFs doesn't re-parse every one of them each time.
"""
import os
import subprocess
from pathlib import Path

from app.services.document_parser import extract_text

DEFAULT_ROOT = Path(__file__).parent.parent.parent / "workspace"

MEMORY_FILE = "MARTY.md"
READ_ONLY_DIRS = ("curriculum",)
SOURCES_DIR = "sources"
PARSED_SUFFIXES = {".pdf", ".docx"}
CACHE_DIR = ".cache"
MAX_READ_CHARS = 60_000  # per read_file call; longer files are read in pieces

DEFAULT_MEMORY = """# MARTY's notes

Things I've learned about Jenn and her classes. I read this at the start of every chat.

## About Jenn's classes
- 9th grade English 1 and 10th grade English 2, Texas public high school (TEKS-aligned)

## Preferences
"""


class WorkspaceError(Exception):
    pass


class Workspace:
    def __init__(self, root: Path):
        self.root = Path(root).resolve()

    # ── Setup ──────────────────────────────────────────────────────────────────

    def ensure(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        for d in ("curriculum", "lessons"):
            (self.root / d).mkdir(exist_ok=True)
            keep = self.root / d / ".gitkeep"
            if not any((self.root / d).iterdir()):
                keep.touch()
        gitignore = self.root / ".gitignore"
        if not gitignore.exists():
            gitignore.write_text(f"{CACHE_DIR}/\n")
        memory = self.root / MEMORY_FILE
        if not memory.exists():
            memory.write_text(DEFAULT_MEMORY)
        if not (self.root / ".git").exists():
            self._git("init", "-q")
            self.commit("Set up workspace")

    # ── Paths ──────────────────────────────────────────────────────────────────

    def _resolve(self, rel: str) -> Path:
        if not rel or Path(rel).is_absolute():
            raise WorkspaceError(f"Path must be relative to the workspace: {rel!r}")
        path = (self.root / rel).resolve()
        if path != self.root and self.root not in path.parents:
            raise WorkspaceError(f"Path is outside the workspace: {rel!r}")
        parts = path.relative_to(self.root).parts
        if ".git" in parts or CACHE_DIR in parts:
            raise WorkspaceError(f"{rel!r} is off limits")
        return path

    def _rel(self, path: Path) -> str:
        return path.relative_to(self.root).as_posix()

    # ── Files ──────────────────────────────────────────────────────────────────

    def list_files(self) -> list[str]:
        files = []
        for dirpath, dirnames, filenames in os.walk(self.root):
            dirnames[:] = [d for d in dirnames if not d.startswith(".")]
            for name in filenames:
                if not name.startswith("."):
                    files.append(self._rel(Path(dirpath) / name))
        return sorted(files)

    def read(self, rel: str) -> str:
        path = self._resolve(rel)
        if not path.is_file():
            raise WorkspaceError(f"File not found: {rel}")
        if path.suffix.lower() in PARSED_SUFFIXES:
            return self._extracted(path)
        return path.read_text(encoding="utf-8", errors="ignore")

    def _extracted(self, path: Path) -> str:
        cache = self.root / CACHE_DIR / "text" / f"{self._rel(path)}.txt"
        if cache.is_file() and cache.stat().st_mtime >= path.stat().st_mtime:
            return cache.read_text(encoding="utf-8")
        text = extract_text(str(path))
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(text, encoding="utf-8")
        return text

    def read_lines(self, rel: str, start_line: int = 1) -> str:
        """Read for MARTY: from start_line, up to MAX_READ_CHARS, with a note on where to
        continue if the file goes on."""
        lines = self.read(rel).splitlines()
        if start_line < 1 or (start_line > len(lines) and lines):
            raise WorkspaceError(f"{rel} has only {len(lines)} lines")
        end, size = start_line - 1, 0
        while end < len(lines) and (end == start_line - 1 or size + len(lines[end]) + 1 <= MAX_READ_CHARS):
            size += len(lines[end]) + 1
            end += 1
        text = "\n".join(lines[start_line - 1:end])
        if end < len(lines):
            text += (f"\n\n[Showing lines {start_line}–{end} of {len(lines)}. "
                     f"Call read_file with start_line={end + 1} to keep reading.]")
        return text

    def is_read_only(self, rel: str) -> bool:
        parts = Path(rel).parts
        return bool(parts) and (
            parts[0] in READ_ONLY_DIRS
            or (len(parts) > 2 and parts[0] == "lessons" and parts[2] == SOURCES_DIR)
        )

    def write(self, rel: str, content: str) -> None:
        path = self._resolve(rel)
        if self.is_read_only(self._rel(path)):
            raise WorkspaceError(f"{self._rel(path)} is read-only — it's one of Jenn's uploaded files")
        if path.suffix.lower() != ".md":
            raise WorkspaceError("Only .md files can be written")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    def edit(self, rel: str, old: str, new: str) -> None:
        text = self.read(rel)
        count = text.count(old)
        if count == 0:
            raise WorkspaceError(f"Text to replace was not found in {rel}")
        if count > 1:
            raise WorkspaceError(
                f"Text to replace appears {count} times in {rel} — include more surrounding text"
            )
        self.write(rel, text.replace(old, new, 1))

    def search(self, query: str) -> list[dict]:
        q = query.lower()
        hits = []
        for rel in self.list_files():
            try:
                text = self.read(rel)
            except WorkspaceError:
                continue
            for i, line in enumerate(text.splitlines(), start=1):
                if q in line.lower():
                    hits.append({"path": rel, "line": i, "text": line.strip()})
        return hits

    # ── Memory ─────────────────────────────────────────────────────────────────

    def memory(self) -> str:
        return self.read(MEMORY_FILE)

    def remember(self, note: str) -> None:
        text = self.memory().rstrip("\n")
        self.write(MEMORY_FILE, f"{text}\n- {note.strip()}\n")

    # ── Git ────────────────────────────────────────────────────────────────────

    def _git(self, *args: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            ["git", "-c", "user.name=MARTY", "-c", "user.email=marty@localhost",
             "-c", "safe.directory=*", *args],
            cwd=self.root, capture_output=True, text=True, check=True,
        )

    def commit(self, message: str) -> bool:
        self._git("add", "-A")
        if not self._git("status", "--porcelain").stdout.strip():
            return False
        self._git("commit", "-q", "-m", message)
        return True


def get_workspace() -> Workspace:
    ws = Workspace(Path(os.getenv("WORKSPACE_DIR", DEFAULT_ROOT)))
    ws.ensure()
    return ws
