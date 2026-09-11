from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.database import get_db

router = APIRouter()


class StudentCreate(BaseModel):
    name: str
    grade: str


class StudentUpdate(BaseModel):
    name: Optional[str] = None
    grade: Optional[str] = None
    active: Optional[bool] = None


@router.get("")
def list_students():
    db = get_db()
    rows = db.execute("SELECT * FROM students ORDER BY grade, name").fetchall()
    db.close()
    return [dict(r) for r in rows]


@router.post("")
def create_student(body: StudentCreate):
    db = get_db()
    cur = db.execute(
        "INSERT INTO students (name, grade) VALUES (?, ?)", (body.name, body.grade)
    )
    db.commit()
    row = db.execute("SELECT * FROM students WHERE id = ?", (cur.lastrowid,)).fetchone()
    db.close()
    return dict(row)


@router.put("/{student_id}")
def update_student(student_id: int, body: StudentUpdate):
    db = get_db()
    row = db.execute("SELECT * FROM students WHERE id = ?", (student_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Student not found")
    fields = {}
    if body.name is not None:
        fields["name"] = body.name
    if body.grade is not None:
        fields["grade"] = body.grade
    if body.active is not None:
        fields["active"] = 1 if body.active else 0
    if fields:
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        db.execute(f"UPDATE students SET {set_clause} WHERE id = ?", [*fields.values(), student_id])
        db.commit()
    row = db.execute("SELECT * FROM students WHERE id = ?", (student_id,)).fetchone()
    db.close()
    return dict(row)


@router.delete("/{student_id}")
def delete_student(student_id: int):
    db = get_db()
    db.execute("DELETE FROM students WHERE id = ?", (student_id,))
    db.commit()
    db.close()
    return {"ok": True}
