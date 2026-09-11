import json
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.database import get_db

router = APIRouter()

CURRICULUM_DIR = Path(__file__).parent.parent.parent / "curriculum"
SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md"}


class DocUpdate(BaseModel):
    title: Optional[str] = None
    subject: Optional[str] = None
    grade: Optional[str] = None
    tags: Optional[list[str]] = None
    description: Optional[str] = None


@router.get("")
def list_documents():
    db = get_db()
    rows = db.execute("SELECT * FROM curriculum_docs ORDER BY added_at DESC").fetchall()
    db.close()
    return [dict(r) for r in rows]


@router.post("/scan")
def scan_curriculum():
    CURRICULUM_DIR.mkdir(exist_ok=True)
    db = get_db()
    added = []
    for path in CURRICULUM_DIR.iterdir():
        if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            continue
        existing = db.execute(
            "SELECT id FROM curriculum_docs WHERE filename = ?", (path.name,)
        ).fetchone()
        if not existing:
            db.execute(
                "INSERT INTO curriculum_docs (filename, filepath, title) VALUES (?, ?, ?)",
                (path.name, str(path), path.stem.replace("_", " ").replace("-", " ").title())
            )
            added.append(path.name)
    db.commit()
    all_rows = db.execute("SELECT * FROM curriculum_docs ORDER BY added_at DESC").fetchall()
    db.close()
    return {"added": added, "documents": [dict(r) for r in all_rows]}


@router.get("/{doc_id}")
def get_document(doc_id: int):
    db = get_db()
    row = db.execute("SELECT * FROM curriculum_docs WHERE id = ?", (doc_id,)).fetchone()
    db.close()
    if not row:
        raise HTTPException(404, "Document not found")
    return dict(row)


@router.put("/{doc_id}")
def update_document(doc_id: int, body: DocUpdate):
    db = get_db()
    row = db.execute("SELECT * FROM curriculum_docs WHERE id = ?", (doc_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Document not found")
    fields = {}
    if body.title is not None:
        fields["title"] = body.title
    if body.subject is not None:
        fields["subject"] = body.subject
    if body.grade is not None:
        fields["grade"] = body.grade
    if body.tags is not None:
        fields["tags"] = json.dumps(body.tags)
    if body.description is not None:
        fields["description"] = body.description
    if fields:
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        values = list(fields.values())
        values.append(doc_id)
        db.execute(f"UPDATE curriculum_docs SET {set_clause} WHERE id = ?", values)
        db.commit()
    row = db.execute("SELECT * FROM curriculum_docs WHERE id = ?", (doc_id,)).fetchone()
    db.close()
    return dict(row)


@router.delete("/{doc_id}")
def delete_document(doc_id: int):
    db = get_db()
    db.execute("DELETE FROM curriculum_docs WHERE id = ?", (doc_id,))
    db.commit()
    db.close()
    return {"ok": True}
