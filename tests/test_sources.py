"""
Importing Jenn's files (one at a time or whole folders) and the _index.md that tells MARTY
what each one is.
"""
import pytest

from app.services import sources
from tests.conftest import make_pdf


def imported(workspace, uploads, lesson=None, **kw):
    return sources.import_files(workspace, uploads, lesson=lesson, **kw)


# ── Where files land ───────────────────────────────────────────────────────────

def test_folder_upload_to_a_lesson_lands_in_its_sources(workspace):
    result = imported(workspace, [
        ("Canto 3/epic.pdf", make_pdf(["Rama is exiled"])),
        ("Canto 3/vocab/words.txt", b"dharma: duty"),
    ], lesson="ramayana-canto3")

    assert result["saved"] == [
        "lessons/ramayana-canto3/sources/epic.pdf",
        "lessons/ramayana-canto3/sources/vocab/words.txt",
    ]
    assert workspace.read("lessons/ramayana-canto3/sources/vocab/words.txt") == "dharma: duty"


def test_lesson_names_are_turned_into_slugs(workspace):
    result = imported(workspace, [("notes.txt", b"x")], lesson="Ramayana: Canto 3!")
    assert result["saved"] == ["lessons/ramayana-canto-3/sources/notes.txt"]


def test_without_a_lesson_files_go_to_curriculum_keeping_their_folder(workspace):
    result = imported(workspace, [("Unit 2/syllabus.txt", b"x"), ("TEKS.txt", b"y")])
    assert result["saved"] == ["curriculum/Unit 2/syllabus.txt", "curriculum/TEKS.txt"]


def test_unsupported_and_system_files_are_skipped(workspace):
    result = imported(workspace, [
        ("Canto 3/epic.txt", b"ok"),
        ("Canto 3/.DS_Store", b"junk"),
        ("Canto 3/__MACOSX/epic.txt", b"junk"),
        ("Canto 3/photo.jpg", b"img"),
    ], lesson="canto3")
    assert result["saved"] == ["lessons/canto3/sources/epic.txt"]
    assert result["skipped"] == ["Canto 3/photo.jpg"]


@pytest.mark.parametrize("name", ["../../MARTY.md", "/etc/passwd.txt", "a/../../b.txt"])
def test_paths_cannot_escape_the_destination(workspace, name):
    result = imported(workspace, [(name, b"x")], lesson="canto3")
    for path in result["saved"]:
        assert path.startswith("lessons/canto3/sources/")
    assert "x" != workspace.read("MARTY.md")


def test_nothing_usable_raises(workspace):
    with pytest.raises(sources.UploadError, match="No supported files"):
        imported(workspace, [("photo.jpg", b"img")])


# ── The index ──────────────────────────────────────────────────────────────────

def test_index_summarizes_each_file(workspace):
    result = imported(workspace, [
        ("Canto 3/epic.pdf", make_pdf(["Rama is exiled to the forest for fourteen years by his father",
                                       "Sita is taken across the sea to Lanka by the demon king Ravana"])),
        ("Canto 3/vocab.txt", b"dharma: duty"),
    ], lesson="canto3")

    assert result["flagged"] == []
    assert result["indexes"] == ["lessons/canto3/sources/_index.md"]
    index = workspace.read("lessons/canto3/sources/_index.md")
    assert "- `epic.pdf` (2 pages) — Summary of epic.pdf." in index
    assert "- `vocab.txt` — Summary of vocab.txt." in index
    assert "_index.md`" not in index  # doesn't list itself


def test_summarizer_sees_the_file_name_and_its_text(workspace, monkeypatch):
    seen = {}
    monkeypatch.setattr(sources, "summarize", lambda name, text: seen.setdefault(name, text) and "ok")
    imported(workspace, [("notes.txt", b"Theme vs. topic")], lesson="canto3")
    assert seen == {"notes.txt": "Theme vs. topic"}


def test_scanned_pdfs_are_flagged_without_a_summary_call(workspace, monkeypatch):
    called = []
    monkeypatch.setattr(sources, "summarize", lambda name, text: called.append(name) or "x")
    result = imported(workspace, [("scan.pdf", make_pdf(["", ""]))], lesson="canto3")

    assert called == []
    assert result["flagged"] == ["lessons/canto3/sources/scan.pdf"]
    index = workspace.read("lessons/canto3/sources/_index.md")
    assert "`scan.pdf` (2 pages) — ⚠️" in index
    assert "scanned" in index


def test_a_failed_summary_doesnt_fail_the_upload(workspace, monkeypatch):
    def boom(name, text):
        raise RuntimeError("API down")
    monkeypatch.setattr(sources, "summarize", boom)
    result = imported(workspace, [("notes.txt", b"x")], lesson="canto3")
    assert result["saved"] == ["lessons/canto3/sources/notes.txt"]
    assert "- `notes.txt` — (no summary yet)" in workspace.read("lessons/canto3/sources/_index.md")


def test_later_uploads_add_to_the_index_without_resummarizing(workspace, monkeypatch):
    imported(workspace, [("a.txt", b"first"), ("b.txt", b"second")], lesson="canto3")

    called = []
    monkeypatch.setattr(sources, "summarize", lambda name, text: called.append(name) or f"New {name}.")
    imported(workspace, [("b.txt", b"second, revised"), ("c.txt", b"third")], lesson="canto3")

    assert sorted(called) == ["b.txt", "c.txt"]  # a.txt keeps its summary; b.txt was replaced
    index = workspace.read("lessons/canto3/sources/_index.md")
    assert "- `a.txt` — Summary of a.txt." in index
    assert "- `b.txt` — New b.txt." in index
    assert "- `c.txt` — New c.txt." in index


def test_curriculum_folders_get_their_own_index(workspace):
    result = imported(workspace, [("Unit 2/a.txt", b"x"), ("Unit 2/b.txt", b"y")])
    assert result["indexes"] == ["curriculum/Unit 2/_index.md"]
    index = workspace.read("curriculum/Unit 2/_index.md")
    assert "`a.txt`" in index and "`b.txt`" in index


def test_curriculum_root_index_leaves_out_folders_that_have_their_own(workspace):
    imported(workspace, [("Unit 2/a.txt", b"x")])
    imported(workspace, [("TEKS.txt", b"y")])
    root = workspace.read("curriculum/_index.md")
    assert "`TEKS.txt`" in root
    assert "a.txt" not in root
