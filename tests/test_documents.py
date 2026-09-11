def test_list_documents_empty(client):
    r = client.get("/api/documents")
    assert r.status_code == 200
    assert r.json() == []


def test_scan_empty_curriculum(client, tmp_path, monkeypatch):
    import app.routers.documents as doc_router
    monkeypatch.setattr(doc_router, "CURRICULUM_DIR", tmp_path)
    r = client.post("/api/documents/scan")
    assert r.status_code == 200
    assert r.json()["added"] == []


def test_scan_picks_up_txt_file(client, tmp_path, monkeypatch):
    import app.routers.documents as doc_router
    monkeypatch.setattr(doc_router, "CURRICULUM_DIR", tmp_path)
    (tmp_path / "unit1.txt").write_text("Unit 1 content")
    r = client.post("/api/documents/scan")
    assert r.status_code == 200
    assert "unit1.txt" in r.json()["added"]


def test_scan_skips_unsupported(client, tmp_path, monkeypatch):
    import app.routers.documents as doc_router
    monkeypatch.setattr(doc_router, "CURRICULUM_DIR", tmp_path)
    (tmp_path / "notes.xlsx").write_text("irrelevant")
    r = client.post("/api/documents/scan")
    assert r.json()["added"] == []


def test_scan_no_duplicates(client, tmp_path, monkeypatch):
    import app.routers.documents as doc_router
    monkeypatch.setattr(doc_router, "CURRICULUM_DIR", tmp_path)
    (tmp_path / "unit1.txt").write_text("content")
    client.post("/api/documents/scan")
    r = client.post("/api/documents/scan")
    assert r.json()["added"] == []


def test_update_document(client, tmp_path, monkeypatch):
    import app.routers.documents as doc_router
    monkeypatch.setattr(doc_router, "CURRICULUM_DIR", tmp_path)
    (tmp_path / "vocab.txt").write_text("words")
    docs = client.post("/api/documents/scan").json()["documents"]
    doc_id = docs[0]["id"]
    r = client.put(f"/api/documents/{doc_id}", json={"title": "Vocab List", "subject": "Literature"})
    assert r.status_code == 200
    assert r.json()["title"] == "Vocab List"
    assert r.json()["subject"] == "Literature"


def test_delete_document(client, tmp_path, monkeypatch):
    import app.routers.documents as doc_router
    monkeypatch.setattr(doc_router, "CURRICULUM_DIR", tmp_path)
    (tmp_path / "f.txt").write_text("x")
    docs = client.post("/api/documents/scan").json()["documents"]
    doc_id = docs[0]["id"]
    client.delete(f"/api/documents/{doc_id}")
    assert client.get("/api/documents").json() == []
