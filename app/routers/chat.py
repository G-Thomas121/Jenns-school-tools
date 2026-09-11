import json
from fastapi import APIRouter, HTTPException, BackgroundTasks, UploadFile, File
from fastapi.responses import Response, FileResponse, StreamingResponse
from pydantic import BaseModel
from pathlib import Path
from typing import Optional
from app.database import get_db
from app.services.marty import run_agent
from app.services.pptx_export import build_pptx

router = APIRouter()

CURRICULUM_DIR = Path(__file__).parent.parent.parent / "curriculum"
SUPPORTED_UPLOADS = {".pdf", ".docx", ".txt", ".md"}


# ── Conversations ───────────────────────────────────────────────────────────────

@router.get("/conversations")
def list_conversations():
    db = get_db()
    rows = db.execute(
        "SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC"
    ).fetchall()
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
        "SELECT id, display_role, display_content, tool_name, created_at "
        "FROM messages WHERE conversation_id=? AND id>? "
        "AND display_role != 'assistant_silent' "
        "ORDER BY id",
        (conv_id, since)
    ).fetchall()
    db.close()
    return [dict(r) for r in rows]


class SendMessage(BaseModel):
    content: str


def _run_agent_task(conv_id: int, content: str):
    try:
        run_agent(conv_id, content)
    except Exception as e:
        db = get_db()
        db.execute(
            "INSERT INTO messages (conversation_id, api_role, api_content, display_role, display_content) "
            "VALUES (?,?,?,?,?)",
            (conv_id, "assistant", json.dumps([{"type": "text", "text": f"Error: {e}"}]),
             "error", f"Something went wrong: {e}")
        )
        db.commit()
        db.close()


@router.post("/conversations/{conv_id}/messages")
def send_message(conv_id: int, body: SendMessage, background_tasks: BackgroundTasks):
    db = get_db()
    conv = db.execute("SELECT id FROM conversations WHERE id=?", (conv_id,)).fetchone()
    db.close()
    if not conv:
        raise HTTPException(404, "Conversation not found")
    background_tasks.add_task(_run_agent_task, conv_id, body.content)
    return {"ok": True, "status": "processing"}


# ── File upload ─────────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    suffix = Path(file.filename).suffix.lower()
    if suffix not in SUPPORTED_UPLOADS:
        raise HTTPException(400, f"Unsupported file type. Accepted: {', '.join(SUPPORTED_UPLOADS)}")

    CURRICULUM_DIR.mkdir(exist_ok=True)
    dest = CURRICULUM_DIR / file.filename
    contents = await file.read()
    dest.write_bytes(contents)

    db = get_db()
    existing = db.execute("SELECT id FROM curriculum_docs WHERE filename=?", (file.filename,)).fetchone()
    if existing:
        db.close()
        return {"message": f"{file.filename} updated.", "filename": file.filename}

    cur = db.execute(
        "INSERT INTO curriculum_docs (filename, filepath, title) VALUES (?,?,?)",
        (file.filename, str(dest), Path(file.filename).stem.replace("_", " ").replace("-", " ").title())
    )
    db.commit()
    doc_id = cur.lastrowid
    db.close()
    return {"message": f"{file.filename} uploaded.", "filename": file.filename, "doc_id": doc_id}


# ── Output downloads ────────────────────────────────────────────────────────────

@router.get("/outputs/{output_id}/download/{variant}")
def download_html(output_id: int, variant: str):
    db = get_db()
    row = db.execute(
        "SELECT o.*, w.name FROM outputs o JOIN workflows w ON w.id=o.workflow_id WHERE o.id=?",
        (output_id,)
    ).fetchone()
    db.close()
    if not row:
        raise HTTPException(404, "Output not found")

    html_map = {"student": row["html"], "teacher": row["teacher_html"], "slideshow": row["slideshow_html"]}
    html = html_map.get(variant)
    if not html:
        raise HTTPException(404, f"No {variant} version for this output")

    safe_name = row["name"].replace(" ", "_").replace("/", "-")[:50]
    filename = f"{safe_name}_{variant}.html"
    return Response(
        content=html.encode(),
        media_type="text/html",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/outputs/{output_id}/export/pptx")
def export_pptx(output_id: int):
    db = get_db()
    row = db.execute(
        "SELECT o.*, w.name FROM outputs o JOIN workflows w ON w.id=o.workflow_id WHERE o.id=?",
        (output_id,)
    ).fetchone()
    db.close()
    if not row:
        raise HTTPException(404, "Output not found")

    slides_json = row["slideshow_json"]
    if not slides_json and row["slideshow_html"]:
        # Fallback: generate JSON from HTML on demand
        from app.services.marty import _extract_slide_json
        slides_json = _extract_slide_json(row["name"], row["slideshow_html"], "")

    if not slides_json:
        raise HTTPException(400, "No slideshow content for this output. Generate a slideshow first.")

    pptx_bytes = build_pptx(slides_json, row["name"])
    safe_name = row["name"].replace(" ", "_").replace("/", "-")[:50]

    return Response(
        content=pptx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": f"attachment; filename={safe_name}.pptx"}
    )
