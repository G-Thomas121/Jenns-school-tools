import subprocess

import pytest

import app.routers.chat as chat_router


def git_log(ws):
    return subprocess.run(
        ["git", "log", "--format=%s"], cwd=ws.root, capture_output=True, text=True
    ).stdout.splitlines()


# ── Conversations ──────────────────────────────────────────────────────────────

def test_create_list_delete_conversation(client):
    conv = client.post("/api/chat/conversations").json()
    assert conv["title"] == "New Chat"
    assert [c["id"] for c in client.get("/api/chat/conversations").json()] == [conv["id"]]

    assert client.delete(f"/api/chat/conversations/{conv['id']}").json() == {"ok": True}
    assert client.get("/api/chat/conversations").json() == []


def test_send_message_runs_agent_in_background(client, monkeypatch):
    calls = []
    monkeypatch.setattr(chat_router, "run_agent", lambda cid, msg: calls.append((cid, msg)))
    conv = client.post("/api/chat/conversations").json()

    r = client.post(f"/api/chat/conversations/{conv['id']}/messages", json={"content": "hi"})
    assert r.status_code == 200
    assert calls == [(conv["id"], "hi")]


def test_running_flag_is_true_only_while_agent_runs(client, monkeypatch):
    conv = client.post("/api/chat/conversations").json()
    url = f"/api/chat/conversations/{conv['id']}/messages"
    seen = []
    monkeypatch.setattr(chat_router, "run_agent", lambda cid, msg: seen.append(client.get(url).json()["running"]))

    assert client.get(url).json()["running"] is False
    client.post(url, json={"content": "hi"})
    assert seen == [True]
    assert client.get(url).json()["running"] is False


def test_send_to_missing_conversation_404s(client):
    assert client.post("/api/chat/conversations/999/messages", json={"content": "hi"}).status_code == 404


def test_agent_crash_becomes_error_message(client, monkeypatch):
    def boom(cid, msg):
        raise RuntimeError("API down")
    monkeypatch.setattr(chat_router, "run_agent", boom)
    conv = client.post("/api/chat/conversations").json()
    client.post(f"/api/chat/conversations/{conv['id']}/messages", json={"content": "hi"})

    msgs = client.get(f"/api/chat/conversations/{conv['id']}/messages").json()["messages"]
    assert msgs[-1]["display_role"] == "error"
    assert "API down" in msgs[-1]["display_content"]


def test_messages_since_returns_only_newer_displayed_rows(client):
    from app.database import get_db
    conv = client.post("/api/chat/conversations").json()
    db = get_db()
    for role, content in [("user", "one"), (None, ""), ("assistant", "two")]:
        db.execute(
            "INSERT INTO messages (conversation_id, display_role, display_content) VALUES (?,?,?)",
            (conv["id"], role, content),
        )
    db.commit()
    db.close()

    all_msgs = client.get(f"/api/chat/conversations/{conv['id']}/messages").json()["messages"]
    assert [m["display_content"] for m in all_msgs] == ["one", "two"]
    newer = client.get(f"/api/chat/conversations/{conv['id']}/messages?since={all_msgs[0]['id']}").json()["messages"]
    assert [m["display_content"] for m in newer] == ["two"]


# ── Files ──────────────────────────────────────────────────────────────────────

def test_list_files(client, workspace):
    workspace.write("lessons/gatsby/lesson-plan.md", "# Plan")
    files = client.get("/api/files").json()
    assert "lessons/gatsby/lesson-plan.md" in files
    assert "MARTY.md" in files


def test_read_file_content(client, workspace):
    workspace.write("lessons/a.md", "# Hello")
    r = client.get("/api/files/content", params={"path": "lessons/a.md"})
    assert r.json() == {"path": "lessons/a.md", "content": "# Hello"}


@pytest.mark.parametrize("path,status", [("lessons/missing.md", 404), ("../secrets.md", 400)])
def test_read_file_errors(client, path, status):
    assert client.get("/api/files/content", params={"path": path}).status_code == status


def test_jenn_can_edit_a_file_directly_and_it_commits(client, workspace):
    workspace.write("lessons/a.md", "draft")
    workspace.commit("draft")
    r = client.put("/api/files/content", json={"path": "lessons/a.md", "content": "final"})
    assert r.status_code == 200
    assert workspace.read("lessons/a.md") == "final"
    assert git_log(workspace)[0] == "Jenn edited lessons/a.md"


def test_upload_goes_to_curriculum_and_commits(client, workspace):
    r = client.post("/api/files/upload", files={"file": ("../Unit 2 Notes.txt", b"Theme vs. topic", "text/plain")})
    assert r.status_code == 200
    assert r.json()["path"] == "curriculum/Unit 2 Notes.txt"
    assert workspace.read("curriculum/Unit 2 Notes.txt") == "Theme vs. topic"
    assert git_log(workspace)[0] == "Upload Unit 2 Notes.txt"


def test_upload_rejects_unsupported_types(client):
    r = client.post("/api/files/upload", files={"file": ("virus.exe", b"x", "application/octet-stream")})
    assert r.status_code == 400
