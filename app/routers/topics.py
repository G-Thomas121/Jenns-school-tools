from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.database import get_db

router = APIRouter()

TYPE_ORDER = ['lesson_plan', 'slideshow', 'worksheet', 'foldable', 'bell_ringer', 'exit_ticket', 'study_guide', 'custom']


class TopicCreate(BaseModel):
    name: str
    grade: str = 'both'


def _workflows_for_topic(db, topic_id: int) -> list:
    rows = db.execute(
        "SELECT w.id, w.name, w.type, w.grade, w.updated_at, "
        "(SELECT o.id FROM outputs o WHERE o.workflow_id=w.id ORDER BY o.id DESC LIMIT 1) as latest_output_id, "
        "(SELECT COUNT(*) FROM outputs o WHERE o.workflow_id=w.id) as output_count "
        "FROM workflows w WHERE w.topic_id=? ORDER BY w.updated_at DESC",
        (topic_id,)
    ).fetchall()
    wfs = [dict(r) for r in rows]
    wfs.sort(key=lambda w: TYPE_ORDER.index(w['type']) if w['type'] in TYPE_ORDER else 99)
    return wfs


@router.get("")
def list_topics():
    db = get_db()
    topics = db.execute(
        "SELECT * FROM lesson_topics ORDER BY updated_at DESC"
    ).fetchall()

    result = []
    for t in topics:
        topic = dict(t)
        topic['workflows'] = _workflows_for_topic(db, t['id'])
        result.append(topic)

    orphaned = db.execute(
        "SELECT w.id, w.name, w.type, w.grade, w.updated_at, "
        "(SELECT o.id FROM outputs o WHERE o.workflow_id=w.id ORDER BY o.id DESC LIMIT 1) as latest_output_id, "
        "(SELECT COUNT(*) FROM outputs o WHERE o.workflow_id=w.id) as output_count "
        "FROM workflows w WHERE w.topic_id IS NULL ORDER BY w.updated_at DESC"
    ).fetchall()

    db.close()
    return {"topics": result, "orphaned": [dict(r) for r in orphaned]}


@router.post("")
def create_topic(body: TopicCreate):
    db = get_db()
    cur = db.execute(
        "INSERT INTO lesson_topics (name, grade) VALUES (?, ?)",
        (body.name, body.grade)
    )
    db.commit()
    row = db.execute("SELECT * FROM lesson_topics WHERE id=?", (cur.lastrowid,)).fetchone()
    db.close()
    return dict(row)


@router.patch("/{topic_id}/touch")
def touch_topic(topic_id: int):
    """Update updated_at so topic sorts to top after new materials are added."""
    db = get_db()
    db.execute("UPDATE lesson_topics SET updated_at=CURRENT_TIMESTAMP WHERE id=?", (topic_id,))
    db.commit()
    db.close()
    return {"ok": True}


@router.delete("/{topic_id}")
def delete_topic(topic_id: int):
    db = get_db()
    db.execute("UPDATE workflows SET topic_id=NULL WHERE topic_id=?", (topic_id,))
    db.execute("DELETE FROM lesson_topics WHERE id=?", (topic_id,))
    db.commit()
    db.close()
    return {"ok": True}
