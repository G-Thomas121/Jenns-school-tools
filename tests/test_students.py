def test_list_empty(client):
    assert client.get("/api/students").json() == []


def test_create_student(client):
    r = client.post("/api/students", json={"name": "Emma Jones", "grade": "english1"})
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "Emma Jones"
    assert data["grade"] == "english1"
    assert data["active"] == 1


def test_update_student(client):
    s = client.post("/api/students", json={"name": "Marcus W", "grade": "english1"}).json()
    r = client.put(f"/api/students/{s['id']}", json={"active": False})
    assert r.status_code == 200
    assert r.json()["active"] == 0


def test_delete_student(client):
    s = client.post("/api/students", json={"name": "Sofia G", "grade": "english2"}).json()
    client.delete(f"/api/students/{s['id']}")
    assert client.get("/api/students").json() == []


def test_students_ordered_by_grade_then_name(client):
    client.post("/api/students", json={"name": "Zara", "grade": "english2"})
    client.post("/api/students", json={"name": "Aaron", "grade": "english1"})
    client.post("/api/students", json={"name": "Beth", "grade": "english1"})
    students = client.get("/api/students").json()
    grades = [s["grade"] for s in students]
    assert grades == sorted(grades)
    e1 = [s["name"] for s in students if s["grade"] == "english1"]
    assert e1 == sorted(e1)
