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
