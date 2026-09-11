def test_list_empty(client):
    assert client.get("/api/suggestions").json() == []


def test_create_suggestion(client):
    r = client.post("/api/suggestions", json={"title": "Export to DOCX", "description": "Would be great to export as Word doc"})
    assert r.status_code == 200
    data = r.json()
    assert data["title"] == "Export to DOCX"
    assert data["status"] == "new"


def test_update_status(client):
    s = client.post("/api/suggestions", json={"title": "T", "description": "D"}).json()
    r = client.put(f"/api/suggestions/{s['id']}", json={"status": "planned"})
    assert r.status_code == 200
    assert r.json()["status"] == "planned"


def test_delete_suggestion(client):
    s = client.post("/api/suggestions", json={"title": "T", "description": "D"}).json()
    client.delete(f"/api/suggestions/{s['id']}")
    assert client.get("/api/suggestions").json() == []
