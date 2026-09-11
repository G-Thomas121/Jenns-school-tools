import shutil
import json
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.services.claude import detect_student_name, grade_submission as claude_grade

router = APIRouter()

INBOX_DIR = Path(__file__).parent.parent.parent / "submissions" / "inbox"
PROCESSED_DIR = Path(__file__).parent.parent.parent / "submissions" / "processed"
SUPPORTED = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf"}


def _match_student(name_guess: str | None, students: list) -> int | None:
    if not name_guess:
        return None
    guess = name_guess.lower().strip()
    for s in students:
        if s["name"].lower().strip() == guess:
            return s["id"]
    # partial match on last name
    guess_parts = guess.split()
    if guess_parts:
        last = guess_parts[-1]
        for s in students:
            if s["name"].lower().split()[-1] == last:
                return s["id"]
    return None


@router.post("/ingest/{workflow_id}")
def ingest(workflow_id: int):
    INBOX_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    db = get_db()
    wf = db.execute("SELECT * FROM workflows WHERE id = ?", (workflow_id,)).fetchone()
    if not wf:
        db.close()
        raise HTTPException(404, "Workflow not found")

    students = [dict(r) for r in db.execute(
        "SELECT * FROM students WHERE active = 1"
    ).fetchall()]

    files = [f for f in INBOX_DIR.iterdir() if f.suffix.lower() in SUPPORTED]
    if not files:
        db.close()
        return {"matched": 0, "needs_review": 0, "total": 0}

    dest_dir = PROCESSED_DIR / str(workflow_id)
    dest_dir.mkdir(exist_ok=True)

    matched, needs_review = 0, 0
    results = []

    for f in files:
        result = detect_student_name(str(f))
        name_guess = result.get("name")
        confidence = result.get("confidence", "low")
        student_id = _match_student(name_guess, students) if confidence == "high" else None

        dest = dest_dir / f.name
        shutil.move(str(f), str(dest))

        status = "confirmed" if (confidence == "high" and student_id) else "needs_review"
        cur = db.execute(
            "INSERT INTO submissions (workflow_id, student_id, filepath, original_filename, "
            "ai_name_guess, confidence, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (workflow_id, student_id, str(dest), f.name, name_guess, confidence, status)
        )
        if status == "confirmed":
            matched += 1
        else:
            needs_review += 1
        results.append({"id": cur.lastrowid, "filename": f.name, "status": status, "ai_guess": name_guess})

    db.commit()
    db.close()
    return {"matched": matched, "needs_review": needs_review, "total": len(files), "results": results}


@router.get("/{workflow_id}")
def list_submissions(workflow_id: int):
    db = get_db()
    rows = db.execute(
        "SELECT s.*, st.name as student_name, g.score, g.max_score "
        "FROM submissions s "
        "LEFT JOIN students st ON st.id = s.student_id "
        "LEFT JOIN grades g ON g.submission_id = s.id "
        "WHERE s.workflow_id = ? ORDER BY s.created_at",
        (workflow_id,)
    ).fetchall()
    db.close()
    return [dict(r) for r in rows]


@router.get("/file/{submission_id}")
def serve_file(submission_id: int):
    db = get_db()
    row = db.execute("SELECT filepath FROM submissions WHERE id = ?", (submission_id,)).fetchone()
    db.close()
    if not row or not Path(row["filepath"]).exists():
        raise HTTPException(404, "File not found")
    return FileResponse(row["filepath"])


@router.put("/{submission_id}/confirm")
def confirm_submission(submission_id: int, body: dict):
    student_id = body.get("student_id")
    db = get_db()
    db.execute(
        "UPDATE submissions SET student_id = ?, status = 'confirmed' WHERE id = ?",
        (student_id, submission_id)
    )
    db.commit()
    row = db.execute("SELECT * FROM submissions WHERE id = ?", (submission_id,)).fetchone()
    db.close()
    return dict(row)


@router.post("/{submission_id}/grade")
def grade_one(submission_id: int):
    db = get_db()
    sub = db.execute("SELECT * FROM submissions WHERE id = ?", (submission_id,)).fetchone()
    if not sub:
        db.close()
        raise HTTPException(404, "Submission not found")
    if dict(sub)["status"] == "needs_review":
        db.close()
        raise HTTPException(400, "Confirm student assignment before grading")
    db.close()

    try:
        result = claude_grade(submission_id)
    except ValueError as e:
        raise HTTPException(400, str(e))

    db = get_db()
    db.execute(
        "INSERT INTO grades (submission_id, score, max_score, feedback, breakdown) "
        "VALUES (?, ?, ?, ?, ?) "
        "ON CONFLICT(submission_id) DO UPDATE SET "
        "score=excluded.score, max_score=excluded.max_score, "
        "feedback=excluded.feedback, breakdown=excluded.breakdown, graded_at=CURRENT_TIMESTAMP",
        (submission_id, result.get("score"), result.get("max_score"),
         result.get("feedback"), json.dumps(result.get("breakdown", {})))
    )
    db.execute("UPDATE submissions SET status = 'graded' WHERE id = ?", (submission_id,))
    db.commit()
    db.close()
    return result


@router.post("/grade-all/{workflow_id}")
def grade_all(workflow_id: int):
    db = get_db()
    subs = db.execute(
        "SELECT id FROM submissions WHERE workflow_id = ? AND status = 'confirmed'",
        (workflow_id,)
    ).fetchall()
    db.close()

    results = []
    for sub in subs:
        try:
            result = claude_grade(sub["id"])
            db = get_db()
            db.execute(
                "INSERT INTO grades (submission_id, score, max_score, feedback, breakdown) "
                "VALUES (?, ?, ?, ?, ?) "
                "ON CONFLICT(submission_id) DO UPDATE SET "
                "score=excluded.score, max_score=excluded.max_score, "
                "feedback=excluded.feedback, breakdown=excluded.breakdown, graded_at=CURRENT_TIMESTAMP",
                (sub["id"], result.get("score"), result.get("max_score"),
                 result.get("feedback"), json.dumps(result.get("breakdown", {})))
            )
            db.execute("UPDATE submissions SET status = 'graded' WHERE id = ?", (sub["id"],))
            db.commit()
            db.close()
            results.append({"submission_id": sub["id"], "ok": True})
        except Exception as e:
            results.append({"submission_id": sub["id"], "ok": False, "error": str(e)})

    return {"results": results}
