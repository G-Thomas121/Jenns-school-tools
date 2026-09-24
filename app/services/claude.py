import os
import json
import base64
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import anthropic

from app.database import get_db
from app.services.document_parser import parse_document

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

SYSTEM_PROMPT = """You are an expert curriculum designer and teaching assistant helping Jenn, \
a 9th and 10th grade English teacher at an accredited U.S. public high school. \
All materials are for standard academic classroom instruction aligned with state English Language Arts standards (RL, RI, W, SL strands). \
Literary texts referenced (e.g. The Lottery, The Most Dangerous Game) are standard canonical works taught in high schools nationwide.

Your job is to create high-quality, classroom-ready materials output as a single, complete HTML document.

Rules:
- Output ONLY valid HTML — no markdown fences, no explanation, just the HTML document.
- Include a <style> block with clean, print-friendly CSS. Use readable fonts (Georgia or Arial), \
appropriate line spacing, and @media print rules so the document prints well.
- For worksheets: include clear sections, instructions, and answer spaces (blank lines or boxes).
- For foldables: lay out content in panels designed for folding (typically 4 quadrants or a tri-fold).
- For slideshows: use a multi-section layout with one "slide" per page break, styled as presentation slides.
- For study guides: use structured sections with headers, key terms, and summary areas.
- Use age-appropriate academic language for 9th/10th graders.
- Align content tightly with any curriculum documents provided.
- Do not include any notes to the teacher inside the HTML output — the document should be student-ready."""


OUTPUT_TYPE_HINTS = {
    "worksheet": "Create a student worksheet with a title, clear directions, and structured activities with answer spaces.",
    "foldable": "Create a foldable study tool. Design it in panels (4 quadrants or tri-fold). Each panel should have a heading and space for student notes or responses.",
    "slideshow": "Create a multi-slide HTML presentation. Each slide is a <section> with page-break-after. Include a title slide, instruction slides, and a closing slide.",
    "study_guide": "Create a comprehensive study guide with organized sections, key vocabulary, important concepts, and review questions.",
    "custom": "Create the classroom material described in the context below.",
}

GRADE_HINTS = {
    "english1": "This is for English 1 (9th grade, typically 14–15 year olds).",
    "english2": "This is for English 2 (10th grade, typically 15–16 year olds).",
    "both": "This material is for both English 1 (9th grade) and English 2 (10th grade).",
}

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
PDF_EXTENSION = ".pdf"

MEDIA_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
}


def _encode_file(filepath: str) -> tuple[str, str]:
    with open(filepath, "rb") as f:
        data = base64.standard_b64encode(f.read()).decode("utf-8")
    suffix = Path(filepath).suffix.lower()
    media_type = MEDIA_TYPES.get(suffix, "image/jpeg")
    return data, media_type


def _file_content_block(filepath: str) -> dict:
    suffix = Path(filepath).suffix.lower()
    data, media_type = _encode_file(filepath)
    if suffix == PDF_EXTENSION:
        return {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": data}}
    return {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": data}}


def build_prompt(workflow: dict, doc_rows: list, context_notes: list) -> str:
    parts = []
    grade_hint = GRADE_HINTS.get(workflow.get("grade", "both"), "")
    type_hint = OUTPUT_TYPE_HINTS.get(workflow.get("type", "custom"), OUTPUT_TYPE_HINTS["custom"])

    parts.append(f"TASK: {type_hint}")
    parts.append(f"CLASS: {grade_hint}")

    if context_notes:
        parts.append("\n--- JENN'S STANDING CONTEXT ---")
        for note in context_notes:
            parts.append(f"[{note['category'].upper()}] {note['title']}:\n{note['content']}")

    if workflow.get("context"):
        parts.append("\n--- CONTEXT FOR THIS MATERIAL ---")
        parts.append(workflow["context"])

    if workflow.get("instructions"):
        parts.append("\n--- SPECIAL INSTRUCTIONS ---")
        parts.append(workflow["instructions"])

    if doc_rows:
        parts.append("\n--- CURRICULUM DOCUMENTS ---")
        for doc in doc_rows:
            title = doc.get("title") or doc["filename"]
            text = parse_document(doc["filepath"])
            parts.append(f"\n[Document: {title}]\n{text}")

    return "\n\n".join(parts)


TEACHER_KEY_SYSTEM = """You are a curriculum expert creating a TEACHER ANSWER KEY / GUIDE version of a student document.

Rules:
- Output ONLY valid HTML — no markdown fences, no explanation.
- Include a <style> block. Add a visible "TEACHER COPY — NOT FOR STUDENTS" banner at the top in red.
- Fill in all answers, sample responses, and model examples for every blank or question.
- Add brief grading notes in [brackets] where helpful (e.g., [Accept any quote that shows foreshadowing]).
- Keep the same layout and structure as the student version — it should be clearly parallel."""

SLIDESHOW_SYSTEM = """You are a curriculum expert creating a teacher-facing slideshow presentation.

Rules:
- Output ONLY valid HTML — no markdown fences, no explanation.
- Each slide is a <section> with style="page-break-after: always; min-height: 5.5in; padding: 0.5in".
- Include a <style> block with clean slide styling: large readable fonts, generous spacing, a consistent color scheme.
- Each slide should have a clear heading and concise bullet points or prompts — not walls of text.
- This is for the teacher to project in class while walking students through the activity.

Required slide sequence:
1. BELL RINGER — A warm-up slide with 2–4 short questions or a brief prompt students answer as class begins. Label it clearly as "Bell Ringer".
2. Title + objective slide
3–N. Step-by-step instruction slides that mirror the student activity
N+1. Discussion / debrief prompts
LAST. EXIT TICKET — 2–3 questions checking today's learning objective. Label it clearly as "Exit Ticket".

- IMPORTANT: Only reference student handouts or printed materials that are explicitly listed in the context provided. Do not invent or mention worksheets, foldables, or other materials that are not listed."""

REVISE_SYSTEM = """You are editing an existing HTML classroom document.

Rules:
- Output ONLY the complete updated HTML — no markdown fences, no explanation.
- Apply the requested changes precisely. Preserve everything else: structure, CSS styling, layout, and content that isn't being changed.
- Do not add or remove major sections unless specifically asked.
- The result must be a complete, valid, standalone HTML document."""

LESSON_PLAN_SYSTEM = """You are creating a TEKS-aligned lesson plan for a Texas high school English teacher. \
Output a single complete HTML document she can reference when filling in her campus Google Doc template.

Structure the document with these exact sections:

1. HEADER — Lesson title, Class (English 1 / English 2), Grade, Date: __________, Duration: __________

2. TEKS STANDARDS — A clean table:
   | TEKS Code | Standard Description |
   Include 2–4 relevant TEKS codes (format: ELA.9.x.X or ELA.10.x.X)

3. LEARNING OBJECTIVE — One sentence: "By the end of this lesson, students will be able to…"

4. MATERIALS — Bulleted list: textbooks, printed handouts (list by name if known), technology, etc.

5. LESSON BREAKDOWN — A table:
   | Minutes | Phase | Teacher Does / Students Do | Handouts / Materials Used |

   Phases (adjust times to the stated class duration):
   • Bell Ringer / Warm-Up
   • Direct Instruction / Mini-Lesson
   • Guided Practice
   • Independent or Small-Group Practice
   • Closure / Exit Ticket

   In the "Handouts / Materials Used" column, only list materials that are explicitly named in the context provided. Do not invent handout names.

6. DIFFERENTIATION — Brief notes: scaffolds for struggling learners, extensions for advanced students, ELL accommodations.

Rules:
- Output ONLY valid HTML — no markdown fences, no explanation.
- Include a <style> block. Tables should be clean and scannable. @media print rules for printing.
- Time allocations must be specific (e.g., "12 min", not "10–15 min")."""


def _extract_text(msg) -> str:
    """claude-opus-5-5 may prepend a thinking block before the text block,
    so the answer isn't reliably content[0]."""
    for block in msg.content:
        if block.type == "text":
            return block.text.strip()
    raise ValueError(f"No text block in response (stop_reason={msg.stop_reason})")


def _call_claude(system: str, prompt: str, max_tokens: int = 8192, model: str = "claude-opus-5-5") -> str:
    msg = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": prompt}],
    )
    return _extract_text(msg)


def _revise_html(existing_html: str, instructions: str, variant_label: str) -> str:
    # Revisions are a constrained edit task (preserve structure, apply one change),
    # not creative generation — Sonnet 5 is fast and plenty capable here.
    prompt = (
        f"Here is the current {variant_label} HTML document:\n\n"
        f"{existing_html}\n\n"
        f"Changes to make:\n{instructions}"
    )
    return _call_claude(REVISE_SYSTEM, prompt, model="claude-sonnet-5")


def _update_job(job_id: str | None, status: str, progress: str, output_id: int | None = None):
    if not job_id:
        return
    db = get_db()
    db.execute(
        "UPDATE jobs SET status=?, progress=?, output_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
        (status, progress, output_id, job_id)
    )
    db.commit()
    db.close()


def generate(
    workflow_id: int,
    notes_override: str | None = None,
    base_output_id: int | None = None,
    revision_instructions: str | None = None,
    variants: list[str] | None = None,
    job_id: str | None = None,
) -> int:
    if variants is None:
        variants = ["student", "teacher", "slideshow"]

    try:
        db = get_db()
        workflow = db.execute("SELECT * FROM workflows WHERE id = ?", (workflow_id,)).fetchone()
        if not workflow:
            raise ValueError(f"Workflow {workflow_id} not found")
        workflow = dict(workflow)

        base_output = None
        if base_output_id:
            row = db.execute("SELECT * FROM outputs WHERE id = ?", (base_output_id,)).fetchone()
            if row:
                base_output = dict(row)

        doc_ids = json.loads(workflow.get("doc_ids") or "[]")
        doc_rows = []
        if doc_ids:
            placeholders = ",".join("?" * len(doc_ids))
            doc_rows = [
                dict(r) for r in db.execute(
                    f"SELECT * FROM curriculum_docs WHERE id IN ({placeholders})", doc_ids
                ).fetchall()
            ]

        context_notes = [
            dict(r) for r in db.execute(
                "SELECT * FROM context_notes WHERE active = 1 ORDER BY category, title"
            ).fetchall()
        ]

        current_version = db.execute(
            "SELECT COALESCE(MAX(version), 0) FROM outputs WHERE workflow_id = ?", (workflow_id,)
        ).fetchone()[0]

        db.close()

        iterating = base_output is not None and revision_instructions

        # --- Student version ---
        _update_job(job_id, "running", "Generating student version…")
        if "student" in variants:
            if iterating:
                student_html = _revise_html(base_output["html"], revision_instructions, "student worksheet")
            else:
                prompt = build_prompt(workflow, doc_rows, context_notes)
                student_html = _call_claude(SYSTEM_PROMPT, prompt)
        else:
            student_html = base_output["html"] if base_output else ""

        # Save output row immediately after student HTML — partial saves are safe
        db = get_db()
        cur = db.execute(
            "INSERT INTO outputs (workflow_id, version, html, status, notes) VALUES (?, ?, ?, 'generating', ?)",
            (workflow_id, current_version + 1, student_html, notes_override)
        )
        output_id = cur.lastrowid
        db.execute("UPDATE workflows SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (workflow_id,))
        db.commit()
        db.close()
        _update_job(job_id, "running", "Generating teacher key and slideshow…", output_id)

        # --- Teacher answer key + slideshow (independent of each other, run concurrently) ---
        def _gen_teacher() -> str | None:
            if "teacher" not in variants:
                return base_output.get("teacher_html") if base_output else None
            if iterating and base_output.get("teacher_html"):
                return _revise_html(base_output["teacher_html"], revision_instructions, "teacher answer key")
            teacher_prompt = (
                f"Here is the student version of this document:\n\n{student_html}\n\n"
                f"Original context: {workflow.get('context') or ''}\n\n"
                "Now create the complete TEACHER ANSWER KEY version."
            )
            return _call_claude(TEACHER_KEY_SYSTEM, teacher_prompt)

        def _gen_slideshow() -> str | None:
            if "slideshow" not in variants:
                return base_output.get("slideshow_html") if base_output else None
            if iterating and base_output.get("slideshow_html"):
                return _revise_html(base_output["slideshow_html"], revision_instructions, "slideshow")
            slideshow_prompt = (
                f"Here is the student activity document this slideshow should accompany:\n\n{student_html}\n\n"
                f"Assignment name: {workflow['name']}\n"
                f"Class: {GRADE_HINTS.get(workflow.get('grade', 'both'), '')}\n\n"
                "Create a slideshow presentation that walks the class through this activity."
            )
            return _call_claude(SLIDESHOW_SYSTEM, slideshow_prompt)

        with ThreadPoolExecutor(max_workers=2) as executor:
            teacher_future = executor.submit(_gen_teacher)
            slideshow_future = executor.submit(_gen_slideshow)
            teacher_html = teacher_future.result()
            slideshow_html = slideshow_future.result()

        db = get_db()
        db.execute(
            "UPDATE outputs SET teacher_html=?, slideshow_html=?, status='complete' WHERE id=?",
            (teacher_html, slideshow_html, output_id)
        )
        db.commit()
        db.close()
        _update_job(job_id, "complete", "Done!", output_id)

        return output_id

    except Exception as e:
        _update_job(job_id, "error", str(e))
        raise


def detect_student_name(filepath: str) -> dict:
    """Read a scanned file and attempt to identify the student's name."""
    suffix = Path(filepath).suffix.lower()
    supported = IMAGE_EXTENSIONS | {PDF_EXTENSION}
    if suffix not in supported:
        return {"name": None, "confidence": "low", "reason": "Unsupported file type"}

    content_block = _file_content_block(filepath)
    msg = client.messages.create(
        model="claude-opus-5-5",
        max_tokens=256,
        messages=[{
            "role": "user",
            "content": [
                content_block,
                {
                    "type": "text",
                    "text": (
                        "Look at this scanned student assignment. Find the student's name written on the paper. "
                        "Return ONLY a JSON object with no extra text: "
                        '{"name": "First Last" or null, "confidence": "high" or "low", "reason": "brief explanation"}\n'
                        "High confidence = name is clearly legible. Low = name is unclear, partial, or missing."
                    ),
                },
            ],
        }],
    )
    try:
        raw = _extract_text(msg)
        # Strip markdown fences if Claude adds them
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw)
    except Exception:
        return {"name": None, "confidence": "low", "reason": "Could not parse response"}


def grade_submission(submission_id: int) -> dict:
    """Grade a submission against its workflow's rubric."""
    db = get_db()
    sub = db.execute(
        "SELECT s.*, w.rubric, w.name as workflow_name, w.grade FROM submissions s "
        "JOIN workflows w ON w.id = s.workflow_id WHERE s.id = ?",
        (submission_id,)
    ).fetchone()
    db.close()

    if not sub:
        raise ValueError(f"Submission {submission_id} not found")
    sub = dict(sub)

    if not sub.get("rubric"):
        raise ValueError("This workflow has no rubric yet. Generate the assignment first.")

    filepath = sub["filepath"]
    suffix = Path(filepath).suffix.lower()
    supported = IMAGE_EXTENSIONS | {PDF_EXTENSION}
    if suffix not in supported:
        raise ValueError(f"Cannot grade file type: {suffix}")

    content_block = _file_content_block(filepath)

    grade_label = GRADE_HINTS.get(sub.get("grade", "both"), "9th/10th grade English")

    msg = client.messages.create(
        model="claude-opus-5-5",
        max_tokens=2048,
        messages=[{
            "role": "user",
            "content": [
                content_block,
                {
                    "type": "text",
                    "text": (
                        f"You are grading a student assignment. Class: {grade_label}\n\n"
                        f"RUBRIC:\n{sub['rubric']}\n\n"
                        "Grade the student work shown above using the rubric. "
                        "Apply expectations appropriate for the class level stated above. "
                        "Return ONLY a JSON object with no extra text:\n"
                        '{"score": <number>, "max_score": <number>, "feedback": "<written feedback for the student>", '
                        '"breakdown": {"<criterion>": {"earned": <pts>, "possible": <pts>, "comment": "<comment>"}}}'
                    ),
                },
            ],
        }],
    )

    raw = ""
    try:
        raw = _extract_text(msg)
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw)
    except Exception:
        return {"score": None, "max_score": None, "feedback": raw, "breakdown": {}}
