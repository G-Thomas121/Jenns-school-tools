import uuid
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.services.claude import generate

router = APIRouter()


class GenerateRequest(BaseModel):
    workflow_id: int
    notes: Optional[str] = None
    base_output_id: Optional[int] = None
    revision_instructions: Optional[str] = None
    variants: list[str] = ["student", "teacher", "slideshow"]


def _run_generation(job_id: str, body: GenerateRequest):
    try:
        generate(
            body.workflow_id,
            notes_override=body.notes,
            base_output_id=body.base_output_id,
            revision_instructions=body.revision_instructions,
            variants=body.variants,
            job_id=job_id,
        )
    except Exception:
        pass  # job status already updated to error inside generate()


@router.post("")
def run_generate(body: GenerateRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    db = get_db()
    wf = db.execute("SELECT id FROM workflows WHERE id=?", (body.workflow_id,)).fetchone()
    if not wf:
        db.close()
        raise HTTPException(404, "Workflow not found")
    db.execute(
        "INSERT INTO jobs (id, workflow_id, status, progress) VALUES (?, ?, 'pending', 'Queued…')",
        (job_id, body.workflow_id)
    )
    db.commit()
    db.close()

    background_tasks.add_task(_run_generation, job_id, body)
    return {"job_id": job_id}


@router.get("/jobs/{job_id}")
def get_job(job_id: str):
    db = get_db()
    row = db.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
    db.close()
    if not row:
        raise HTTPException(404, "Job not found")
    return dict(row)
