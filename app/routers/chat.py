from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from app.database import get_db
from app.services.agent import request_stop, run_agent

router = APIRouter()

# Conversations with an agent run in flight. Set before the background task is scheduled
# so the very first poll after sending already sees it.
_running: set[int] = set()


@router.get("/conversations")
def list_conversations():
    db = get_db()
    rows = db.execute("SELECT * FROM conversations ORDER BY updated_at DESC, id DESC").fetchall()
    db.close()
    return [dict(r) for r in rows]


@router.post("/conversations")
def create_conversation():
    db = get_db()
    cur = db.execute("INSERT INTO conversations (title) VALUES ('New Chat')")
    db.commit()
    row = db.execute("SELECT * FROM conversations WHERE id=?", (cur.lastrowid,)).fetchone()
    db.close()
    return dict(row)


@router.delete("/conversations/{conv_id}")
def delete_conversation(conv_id: int):
    db = get_db()
    db.execute("DELETE FROM conversations WHERE id=?", (conv_id,))
    db.commit()
    db.close()
    return {"ok": True}


@router.get("/conversations/{conv_id}/messages")
def get_messages(conv_id: int, since: int = 0):
    db = get_db()
    rows = db.execute(
        "SELECT id, display_role, display_content, path, created_at FROM messages "
        "WHERE conversation_id=? AND id>? AND display_role IS NOT NULL ORDER BY id",
        (conv_id, since),
    ).fetchall()
    db.close()
    return {"messages": [dict(r) for r in rows], "running": conv_id in _running}


class SendMessage(BaseModel):
    content: str


def _run_agent_task(conv_id: int, content: str):
    try:
        run_agent(conv_id, content)
    except Exception as e:
        db = get_db()
        db.execute(
            "INSERT INTO messages (conversation_id, display_role, display_content) VALUES (?,?,?)",
            (conv_id, "error", f"Something went wrong: {e}"),
        )
        db.commit()
        db.close()
    finally:
        _running.discard(conv_id)


@router.post("/conversations/{conv_id}/messages")
def send_message(conv_id: int, body: SendMessage, background_tasks: BackgroundTasks):
    db = get_db()
    conv = db.execute("SELECT id FROM conversations WHERE id=?", (conv_id,)).fetchone()
    db.close()
    if not conv:
        raise HTTPException(404, "Conversation not found")
    if conv_id in _running:
        raise HTTPException(409, "MARTY is still working on the last message")
    _running.add(conv_id)
    background_tasks.add_task(_run_agent_task, conv_id, body.content)
    return {"ok": True}


@router.post("/conversations/{conv_id}/stop")
def stop_conversation(conv_id: int):
    request_stop(conv_id)
    return {"ok": True}
