def test_list_empty(client):
    assert client.get("/api/context").json() == []


def test_create_note(client):
    r = client.post("/api/context", json={"title": "My Class", "content": "28 students", "category": "class"})
    assert r.status_code == 200
    data = r.json()
    assert data["title"] == "My Class"
    assert data["active"] == 1


def test_update_note(client):
    note = client.post("/api/context", json={"title": "T", "content": "C", "category": "general"}).json()
    r = client.put(f"/api/context/{note['id']}", json={"title": "Updated", "active": False})
    assert r.status_code == 200
    assert r.json()["title"] == "Updated"
    assert r.json()["active"] == 0


def test_delete_note(client):
    note = client.post("/api/context", json={"title": "T", "content": "C", "category": "general"}).json()
    client.delete(f"/api/context/{note['id']}")
    assert client.get("/api/context").json() == []


def test_deactivated_note_not_active(client):
    note = client.post("/api/context", json={"title": "T", "content": "C", "category": "general"}).json()
    client.put(f"/api/context/{note['id']}", json={"active": False})
    notes = client.get("/api/context").json()
    assert notes[0]["active"] == 0
