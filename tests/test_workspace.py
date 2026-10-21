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
