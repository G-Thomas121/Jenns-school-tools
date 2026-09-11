from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.database import get_db

router = APIRouter()


class SuggestionCreate(BaseModel):
    title: str
    description: str


class SuggestionUpdate(BaseModel):
    status: str


@router.get("")
def list_suggestions():
    db = get_db()
    rows = db.execute("SELECT * FROM suggestions ORDER BY created_at DESC").fetchall()
    db.close()
    return [dict(r) for r in rows]


@router.post("")
def create_suggestion(body: SuggestionCreate):
    db = get_db()
    cur = db.execute(
        "INSERT INTO suggestions (title, description) VALUES (?, ?)",
        (body.title, body.description)
    )
    db.commit()
    row = db.execute("SELECT * FROM suggestions WHERE id = ?", (cur.lastrowid,)).fetchone()
    db.close()
    return dict(row)


@router.put("/{suggestion_id}")
def update_suggestion(suggestion_id: int, body: SuggestionUpdate):
    db = get_db()
    db.execute("UPDATE suggestions SET status = ? WHERE id = ?", (body.status, suggestion_id))
    db.commit()
    row = db.execute("SELECT * FROM suggestions WHERE id = ?", (suggestion_id,)).fetchone()
    db.close()
    if not row:
        raise HTTPException(404, "Suggestion not found")
    return dict(row)


@router.delete("/{suggestion_id}")
def delete_suggestion(suggestion_id: int):
    db = get_db()
    db.execute("DELETE FROM suggestions WHERE id = ?", (suggestion_id,))
    db.commit()
    db.close()
    return {"ok": True}
