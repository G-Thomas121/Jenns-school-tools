def test_gradebook_empty(client):
    r = client.get("/api/gradebook")
    assert r.status_code == 200
    assert r.json() == []


def test_gradebook_summary_empty(client):
    r = client.get("/api/gradebook/summary")
    assert r.status_code == 200
    assert r.json() == []


def test_gradebook_summary_with_student(client):
    client.post("/api/students", json={"name": "Alex", "grade": "english1"})
    r = client.get("/api/gradebook/summary")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["name"] == "Alex"
    assert data[0]["graded_count"] == 0
    assert data[0]["avg_pct"] is None


def test_gradebook_export_csv(client):
    client.post("/api/students", json={"name": "Alex", "grade": "english1"})
    r = client.get("/api/gradebook/export")
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]
    content = r.content.decode()
    assert "Student Name" in content
    assert "Alex" in content


def test_gradebook_filter_by_grade(client):
    client.post("/api/students", json={"name": "A", "grade": "english1"})
    client.post("/api/students", json={"name": "B", "grade": "english2"})
    r = client.get("/api/gradebook/summary?grade=english1")
    data = r.json()
    assert len(data) == 1
    assert data[0]["name"] == "A"
