import json
import queue

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.database import get_db
from app.services.agent import request_stop, run_agent
from app.services.events import broker

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
        broker.publish(conv_id, {"type": "done"})


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


KEEPALIVE_SECONDS = 15


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event)}\n\n"


def stream_events(conv_id: int, since: int = 0):
    """Replay saved chat rows after `since`, then forward live events until the run is done.
    Subscribing before reading the DB means nothing falls in the gap; rows that show up in
    both places are skipped by id."""
    q = broker.subscribe(conv_id)
    try:
        running = conv_id in _running
        last_id = since
        for row in get_messages(conv_id, since)["messages"]:
            last_id = row["id"]
            yield _sse({"type": "message", "message": row})
        yield _sse({"type": "status", "running": running})
        if not running:
            yield _sse({"type": "done"})
            return
        while True:
            try:
                event = q.get(timeout=KEEPALIVE_SECONDS)
            except queue.Empty:
                yield ": keepalive\n\n"
                continue
            if event["type"] == "message":
                if event["message"]["id"] <= last_id:
                    continue
                last_id = event["message"]["id"]
            yield _sse(event)
            if event["type"] == "done":
                return
    finally:
        broker.unsubscribe(conv_id, q)


@router.get("/conversations/{conv_id}/stream")
def stream(conv_id: int, since: int = 0):
    return StreamingResponse(
        stream_events(conv_id, since),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
