def test_list_workflows_empty(client):
    r = client.get("/api/workflows")
    assert r.status_code == 200
    assert r.json() == []


def test_create_workflow(client):
    payload = {"name": "Test Worksheet", "type": "worksheet", "grade": "english1"}
    r = client.post("/api/workflows", json=payload)
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "Test Worksheet"
    assert data["type"] == "worksheet"
    assert data["grade"] == "english1"
    assert data["id"] is not None


def test_get_workflow(client):
    wf = client.post("/api/workflows", json={"name": "W", "type": "foldable", "grade": "english2"}).json()
    r = client.get(f"/api/workflows/{wf['id']}")
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "W"
    assert data["outputs"] == []


def test_get_workflow_not_found(client):
    r = client.get("/api/workflows/9999")
    assert r.status_code == 404


def test_update_workflow(client):
    wf = client.post("/api/workflows", json={"name": "Old Name", "type": "worksheet", "grade": "both"}).json()
    r = client.put(f"/api/workflows/{wf['id']}", json={"name": "New Name"})
    assert r.status_code == 200
    assert r.json()["name"] == "New Name"


def test_delete_workflow(client):
    wf = client.post("/api/workflows", json={"name": "To Delete", "type": "worksheet", "grade": "both"}).json()
    r = client.delete(f"/api/workflows/{wf['id']}")
    assert r.status_code == 200
    r2 = client.get(f"/api/workflows/{wf['id']}")
    assert r2.status_code == 404


def test_list_workflows_shows_output_count(client):
    wf = client.post("/api/workflows", json={"name": "W", "type": "worksheet", "grade": "both"}).json()
    r = client.get("/api/workflows")
    assert r.json()[0]["output_count"] == 0
