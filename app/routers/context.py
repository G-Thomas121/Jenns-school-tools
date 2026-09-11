from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.database import get_db

router = APIRouter()


class NoteCreate(BaseModel):
    title: str
    content: str
    category: str = "general"
    active: bool = True


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    active: Optional[bool] = None


@router.get("")
def list_notes():
    db = get_db()
    rows = db.execute("SELECT * FROM context_notes ORDER BY active DESC, updated_at DESC").fetchall()
    db.close()
    return [dict(r) for r in rows]


@router.post("")
def create_note(body: NoteCreate):
    db = get_db()
    cur = db.execute(
        "INSERT INTO context_notes (title, content, category, active) VALUES (?, ?, ?, ?)",
        (body.title, body.content, body.category, 1 if body.active else 0)
    )
    db.commit()
    row = db.execute("SELECT * FROM context_notes WHERE id = ?", (cur.lastrowid,)).fetchone()
    db.close()
    return dict(row)


@router.get("/{note_id}")
def get_note(note_id: int):
    db = get_db()
    row = db.execute("SELECT * FROM context_notes WHERE id = ?", (note_id,)).fetchone()
    db.close()
    if not row:
        raise HTTPException(404, "Note not found")
    return dict(row)


@router.put("/{note_id}")
def update_note(note_id: int, body: NoteUpdate):
    db = get_db()
    row = db.execute("SELECT * FROM context_notes WHERE id = ?", (note_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Note not found")
    fields = {}
    if body.title is not None:
        fields["title"] = body.title
    if body.content is not None:
        fields["content"] = body.content
    if body.category is not None:
        fields["category"] = body.category
    if body.active is not None:
        fields["active"] = 1 if body.active else 0
    if fields:
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        set_clause += ", updated_at = CURRENT_TIMESTAMP"
        values = list(fields.values())
        values.append(note_id)
        db.execute(f"UPDATE context_notes SET {set_clause} WHERE id = ?", values)
        db.commit()
    row = db.execute("SELECT * FROM context_notes WHERE id = ?", (note_id,)).fetchone()
    db.close()
    return dict(row)


@router.delete("/{note_id}")
def delete_note(note_id: int):
    db = get_db()
    db.execute("DELETE FROM context_notes WHERE id = ?", (note_id,))
    db.commit()
    db.close()
    return {"ok": True}
