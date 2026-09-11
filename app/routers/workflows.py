import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.database import get_db

router = APIRouter()


class WorkflowCreate(BaseModel):
    name: str
    type: str
    grade: str = "both"
    context: Optional[str] = None
    instructions: Optional[str] = None
    doc_ids: list[int] = []


class WorkflowUpdate(BaseModel):
    name: Optional[str] = None
    context: Optional[str] = None
    instructions: Optional[str] = None
    doc_ids: Optional[list[int]] = None
    rubric: Optional[str] = None


@router.get("")
def list_workflows():
    db = get_db()
    rows = db.execute(
        "SELECT w.*, COUNT(o.id) as output_count FROM workflows w "
        "LEFT JOIN outputs o ON o.workflow_id = w.id "
        "GROUP BY w.id ORDER BY w.updated_at DESC"
    ).fetchall()
    db.close()
    return [dict(r) for r in rows]


@router.post("")
def create_workflow(body: WorkflowCreate):
    db = get_db()
    cur = db.execute(
        "INSERT INTO workflows (name, type, grade, context, instructions, doc_ids) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (body.name, body.type, body.grade, body.context, body.instructions, json.dumps(body.doc_ids))
    )
    db.commit()
    row = db.execute("SELECT * FROM workflows WHERE id = ?", (cur.lastrowid,)).fetchone()
    db.close()
    return dict(row)


@router.get("/{workflow_id}")
def get_workflow(workflow_id: int):
    db = get_db()
    row = db.execute("SELECT * FROM workflows WHERE id = ?", (workflow_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Workflow not found")
    outputs = db.execute(
        "SELECT id, version, notes, created_at FROM outputs WHERE workflow_id = ? ORDER BY version DESC",
        (workflow_id,)
    ).fetchall()
    db.close()
    result = dict(row)
    result["outputs"] = [dict(o) for o in outputs]
    return result


@router.put("/{workflow_id}")
def update_workflow(workflow_id: int, body: WorkflowUpdate):
    db = get_db()
    row = db.execute("SELECT * FROM workflows WHERE id = ?", (workflow_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Workflow not found")
    fields = {}
    if body.name is not None:
        fields["name"] = body.name
    if body.context is not None:
        fields["context"] = body.context
    if body.instructions is not None:
        fields["instructions"] = body.instructions
    if body.doc_ids is not None:
        fields["doc_ids"] = json.dumps(body.doc_ids)
    if body.rubric is not None:
        fields["rubric"] = body.rubric
    if fields:
        fields["updated_at"] = "CURRENT_TIMESTAMP"
        set_clause = ", ".join(f"{k} = ?" for k in fields if k != "updated_at")
        set_clause += ", updated_at = CURRENT_TIMESTAMP"
        values = [v for k, v in fields.items() if k != "updated_at"]
        values.append(workflow_id)
        db.execute(f"UPDATE workflows SET {set_clause} WHERE id = ?", values)
        db.commit()
    row = db.execute("SELECT * FROM workflows WHERE id = ?", (workflow_id,)).fetchone()
    db.close()
    return dict(row)


@router.delete("/{workflow_id}")
def delete_workflow(workflow_id: int):
    db = get_db()
    db.execute("DELETE FROM workflows WHERE id = ?", (workflow_id,))
    db.commit()
    db.close()
    return {"ok": True}


@router.get("/{workflow_id}/outputs/{output_id}")
def get_output(workflow_id: int, output_id: int):
    db = get_db()
    row = db.execute(
        "SELECT * FROM outputs WHERE id = ? AND workflow_id = ?", (output_id, workflow_id)
    ).fetchone()
    db.close()
    if not row:
        raise HTTPException(404, "Output not found")
    return dict(row)


@router.delete("/{workflow_id}/outputs/{output_id}")
def delete_output(workflow_id: int, output_id: int):
    db = get_db()
    db.execute("DELETE FROM outputs WHERE id = ? AND workflow_id = ?", (output_id, workflow_id))
    db.commit()
    db.close()
    return {"ok": True}
