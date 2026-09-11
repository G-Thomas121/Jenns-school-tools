import csv
import io
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from app.database import get_db

router = APIRouter()


@router.get("")
def get_gradebook(grade: str | None = None):
    db = get_db()
    query = """
        SELECT
            st.id as student_id, st.name as student_name, st.grade as student_grade,
            w.id as workflow_id, w.name as workflow_name, w.type as workflow_type,
            g.score, g.max_score, g.feedback, g.graded_at,
            s.id as submission_id, s.status
        FROM students st
        LEFT JOIN submissions s ON s.student_id = st.id
        LEFT JOIN workflows w ON w.id = s.workflow_id
        LEFT JOIN grades g ON g.submission_id = s.id
        WHERE st.active = 1
    """
    params = []
    if grade:
        query += " AND st.grade = ?"
        params.append(grade)
    query += " ORDER BY st.grade, st.name, w.name"

    rows = db.execute(query, params).fetchall()
    db.close()
    return [dict(r) for r in rows]


@router.get("/summary")
def get_summary(grade: str | None = None):
    db = get_db()
    query = """
        SELECT
            st.id, st.name, st.grade,
            COUNT(g.id) as graded_count,
            ROUND(AVG(CAST(g.score AS REAL) / NULLIF(g.max_score, 0) * 100), 1) as avg_pct
        FROM students st
        LEFT JOIN submissions s ON s.student_id = st.id
        LEFT JOIN grades g ON g.submission_id = s.id
        WHERE st.active = 1
    """
    params = []
    if grade:
        query += " AND st.grade = ?"
        params.append(grade)
    query += " GROUP BY st.id ORDER BY st.grade, st.name"

    rows = db.execute(query, params).fetchall()
    db.close()
    return [dict(r) for r in rows]


@router.get("/export")
def export_csv(grade: str | None = None):
    db = get_db()

    # Get all assignments that have at least one grade
    assignments = db.execute(
        "SELECT DISTINCT w.id, w.name FROM workflows w "
        "JOIN submissions s ON s.workflow_id = w.id "
        "JOIN grades g ON g.submission_id = s.id ORDER BY w.name"
    ).fetchall()

    students_q = "SELECT * FROM students WHERE active = 1"
    params = []
    if grade:
        students_q += " AND grade = ?"
        params.append(grade)
    students_q += " ORDER BY grade, name"
    students = db.execute(students_q, params).fetchall()

    # Build grade lookup: {student_id: {workflow_id: score_pct}}
    grades_raw = db.execute(
        "SELECT s.student_id, s.workflow_id, g.score, g.max_score "
        "FROM grades g JOIN submissions s ON s.id = g.submission_id"
    ).fetchall()
    db.close()

    grade_map = {}
    for r in grades_raw:
        sid, wid = r["student_id"], r["workflow_id"]
        pct = round(r["score"] / r["max_score"] * 100, 1) if r["max_score"] else None
        grade_map.setdefault(sid, {})[wid] = pct

    output = io.StringIO()
    writer = csv.writer(output)

    headers = ["Student Name", "Class"] + [a["name"] for a in assignments] + ["Average %"]
    writer.writerow(headers)

    for st in students:
        row = [st["name"], st["grade"]]
        pcts = []
        for a in assignments:
            pct = grade_map.get(st["id"], {}).get(a["id"])
            row.append(f"{pct}%" if pct is not None else "")
            if pct is not None:
                pcts.append(pct)
        avg = round(sum(pcts) / len(pcts), 1) if pcts else ""
        row.append(f"{avg}%" if avg != "" else "")
        writer.writerow(row)

    output.seek(0)
    filename = f"gradebook_{grade or 'all'}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
