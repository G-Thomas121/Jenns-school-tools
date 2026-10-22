import subprocess

import pytest

from app.services.workspace import Workspace, WorkspaceError


@pytest.fixture
def ws(tmp_path):
    w = Workspace(tmp_path / "workspace")
    w.ensure()
    return w


def _git_log(ws):
    out = subprocess.run(
        ["git", "log", "--format=%s"], cwd=ws.root, capture_output=True, text=True
    )
    return [line for line in out.stdout.splitlines() if line]


# ── Setup ──────────────────────────────────────────────────────────────────────

def test_ensure_creates_layout_and_git_repo(ws):
    assert (ws.root / "MARTY.md").is_file()
    assert (ws.root / "curriculum").is_dir()
    assert (ws.root / "lessons").is_dir()
    assert (ws.root / ".git").is_dir()
    assert _git_log(ws) == ["Set up workspace"]


def test_ensure_is_idempotent_and_keeps_memory(ws):
    (ws.root / "MARTY.md").write_text("# custom memory")
    ws.ensure()
    assert (ws.root / "MARTY.md").read_text() == "# custom memory"
    assert _git_log(ws) == ["Set up workspace"]


# ── Read / write ───────────────────────────────────────────────────────────────

def test_write_then_read_creates_parent_dirs(ws):
    ws.write("lessons/gatsby/lesson-plan.md", "# Gatsby")
    assert ws.read("lessons/gatsby/lesson-plan.md") == "# Gatsby"


def test_read_missing_file_raises(ws):
    with pytest.raises(WorkspaceError, match="not found"):
        ws.read("lessons/nope.md")


@pytest.mark.parametrize("bad", ["../escape.md", "/etc/passwd", "lessons/../../x.md", ".git/config"])
def test_paths_outside_workspace_are_rejected(ws, bad):
    with pytest.raises(WorkspaceError):
        ws.write(bad, "x")
    with pytest.raises(WorkspaceError):
        ws.read(bad)


def test_curriculum_is_read_only_for_writes(ws):
    with pytest.raises(WorkspaceError, match="read-only"):
        ws.write("curriculum/unit1.md", "overwritten")


def test_only_markdown_files_can_be_written(ws):
    with pytest.raises(WorkspaceError, match=".md"):
        ws.write("lessons/sneaky.html", "<html>")


def test_read_docx_returns_extracted_text(ws):
    from docx import Document

    doc = Document()
    doc.add_paragraph("The Most Dangerous Game")
    doc.save(ws.root / "curriculum" / "unit.docx")
    assert "The Most Dangerous Game" in ws.read("curriculum/unit.docx")


# ── Edit ───────────────────────────────────────────────────────────────────────

def test_edit_replaces_unique_match(ws):
    ws.write("lessons/a.md", "Question 1\nQuestion 2\n")
    ws.edit("lessons/a.md", "Question 2", "Question 2 (revised)")
    assert ws.read("lessons/a.md") == "Question 1\nQuestion 2 (revised)\n"


def test_edit_errors_when_text_missing(ws):
    ws.write("lessons/a.md", "hello")
    with pytest.raises(WorkspaceError, match="not found"):
        ws.edit("lessons/a.md", "goodbye", "x")


def test_edit_errors_when_text_ambiguous(ws):
    ws.write("lessons/a.md", "same\nsame\n")
    with pytest.raises(WorkspaceError, match="2 times"):
        ws.edit("lessons/a.md", "same", "x")


# ── List / search ──────────────────────────────────────────────────────────────

def test_list_files_is_sorted_and_hides_git(ws):
    ws.write("lessons/b.md", "b")
    ws.write("lessons/a/plan.md", "a")
    files = ws.list_files()
    assert files == sorted(files)
    assert "lessons/a/plan.md" in files and "MARTY.md" in files
    assert not any(f.startswith(".git") for f in files)


def test_search_is_case_insensitive_with_line_numbers(ws):
    ws.write("lessons/a.md", "intro\nRainsford is the hunter\n")
    ws.write("lessons/b.md", "nothing here")
    assert ws.search("rainsford") == [
        {"path": "lessons/a.md", "line": 2, "text": "Rainsford is the hunter"}
    ]


# ── Memory ─────────────────────────────────────────────────────────────────────

def test_remember_appends_bullet_to_memory(ws):
    ws.remember("Prefers 4-panel foldables")
    ws.remember("2nd period runs 45 minutes")
    memory = ws.memory()
    assert "- Prefers 4-panel foldables" in memory
    assert memory.index("4-panel") < memory.index("2nd period")


# ── Git ────────────────────────────────────────────────────────────────────────

def test_commit_records_changes(ws):
    ws.write("lessons/a.md", "a")
    assert ws.commit("Draft worksheet") is True
    assert _git_log(ws)[0] == "Draft worksheet"


def test_commit_without_changes_is_noop(ws):
    assert ws.commit("Nothing") is False
    assert _git_log(ws) == ["Set up workspace"]


# ── Lesson sources & large files ───────────────────────────────────────────────

from tests.conftest import make_pdf


def test_lesson_sources_folders_are_read_only(ws):
    (ws.root / "lessons/canto3/sources").mkdir(parents=True)
    with pytest.raises(WorkspaceError, match="read-only"):
        ws.write("lessons/canto3/sources/notes.md", "overwritten")
    ws.write("lessons/canto3/lesson-plan.md", "# Plan")  # the lesson itself stays writable


def test_pdf_text_is_marked_by_page(ws):
    (ws.root / "curriculum/epic.pdf").write_bytes(make_pdf(["Rama is exiled", "Sita is taken"]))
    text = ws.read("curriculum/epic.pdf")
    assert text.index("--- Page 1 ---") < text.index("Rama is exiled")
    assert text.index("--- Page 2 ---") < text.index("Sita is taken")


def test_long_files_are_read_whole_by_the_app(ws):
    (ws.root / "curriculum/long.txt").write_text("x" * 100_000)
    assert len(ws.read("curriculum/long.txt")) == 100_000


def test_read_lines_pages_through_long_files(ws):
    lines = [f"line {i} " + "x" * 50 for i in range(1, 5001)]
    (ws.root / "curriculum/long.txt").write_text("\n".join(lines))

    first = ws.read_lines("curriculum/long.txt")
    assert first.startswith("line 1 ")
    assert "line 5000 " not in first
    shown = first.count("\nline ") + 1
    assert f"start_line={shown + 1}" in first  # tells MARTY where to pick up

    rest = ws.read_lines("curriculum/long.txt", start_line=4999)
    assert rest.startswith("line 4999 ")
    assert "line 5000 " in rest
    assert "start_line=" not in rest


def test_read_lines_returns_short_files_unchanged(ws):
    ws.write("lessons/a/plan.md", "# Plan\nBody")
    assert ws.read_lines("lessons/a/plan.md") == "# Plan\nBody"


def test_read_lines_past_the_end_says_so(ws):
    ws.write("lessons/a/plan.md", "# Plan\nBody")
    with pytest.raises(WorkspaceError, match="only 2 lines"):
        ws.read_lines("lessons/a/plan.md", start_line=10)


def test_extracted_text_is_cached_until_the_file_changes(ws, monkeypatch):
    from app.services import workspace as workspace_module
    calls = []
    real = workspace_module.extract_text
    monkeypatch.setattr(workspace_module, "extract_text", lambda p: calls.append(p) or real(p))

    pdf = ws.root / "curriculum/epic.pdf"
    pdf.write_bytes(make_pdf(["First draft"]))
    assert "First draft" in ws.read("curriculum/epic.pdf")
    ws.search("anything")
    ws.read("curriculum/epic.pdf")
    assert len(calls) == 1

    import os, time
    pdf.write_bytes(make_pdf(["Second draft"]))
    later = time.time() + 5
    os.utime(pdf, (later, later))
    assert "Second draft" in ws.read("curriculum/epic.pdf")
    assert len(calls) == 2


def test_text_cache_is_hidden_and_not_committed(ws):
    (ws.root / "curriculum/epic.pdf").write_bytes(make_pdf(["Rama"]))
    ws.read("curriculum/epic.pdf")
    assert not any(f.startswith(".cache") for f in ws.list_files())
    ws.commit("upload")
    tracked = subprocess.run(["git", "ls-files"], cwd=ws.root, capture_output=True, text=True).stdout
    assert ".cache" not in tracked
    with pytest.raises(WorkspaceError):
        ws.read(".cache/text/curriculum/epic.pdf.txt")


def test_search_finds_text_inside_pdfs(ws):
    (ws.root / "lessons/canto3/sources").mkdir(parents=True)
    (ws.root / "lessons/canto3/sources/epic.pdf").write_bytes(make_pdf(["Intro", "Dasaratha grieves"]))
    hits = ws.search("dasaratha")
    assert [(h["path"], h["text"]) for h in hits] == [("lessons/canto3/sources/epic.pdf", "Dasaratha grieves")]
