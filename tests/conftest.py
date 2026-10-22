import os
import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("ANTHROPIC_API_KEY", "test-key-not-real")

import app.database as db_module


@pytest.fixture(autouse=True)
def tmp_db(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"
    monkeypatch.setattr(db_module, "DB_PATH", db_path)
    db_module.init_db()
    return db_path


@pytest.fixture(autouse=True)
def workspace(tmp_path, monkeypatch):
    """Every test gets its own throwaway workspace — never Jenn's real one."""
    from app.services.workspace import get_workspace
    monkeypatch.setenv("WORKSPACE_DIR", str(tmp_path / "workspace"))
    return get_workspace()


@pytest.fixture
def client(tmp_db):
    from app.main import app
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def no_network_summaries(monkeypatch):
    """Upload summaries come from a real model in the app; tests use a canned one."""
    from app.services import sources
    monkeypatch.setattr(sources, "summarize", lambda name, text: f"Summary of {name}.")


def make_pdf(pages: list[str]) -> bytes:
    """A minimal real PDF with one line of text per page (an empty string makes a blank page,
    like a scan with no text layer)."""
    objects = ["<< /Type /Catalog /Pages 2 0 R >>", None,
               "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    kids = []
    for text in pages:
        stream = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET" if text else ""
        objects.append(f"<< /Length {len(stream)} >>\nstream\n{stream}\nendstream")
        content = len(objects)
        objects.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
                       f"/Resources << /Font << /F1 3 0 R >> >> /Contents {content} 0 R >>")
        kids.append(f"{len(objects)} 0 R")
    objects[1] = f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {len(kids)} >>"
    out, offsets = "%PDF-1.4\n", []
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n{obj}\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n"
    out += "".join(f"{o:010d} 00000 n \n" for o in offsets)
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n"
    return out.encode("latin-1")
