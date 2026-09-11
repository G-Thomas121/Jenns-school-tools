"""
MARTY — Jenn's teaching assistant agent.
Runs a tool-use loop, saving every message and tool call to the DB as it happens
so the frontend can poll and display progress in real time.
"""
import json
import os
from pathlib import Path
from anthropic import Anthropic

from app.database import get_db
from app.services.document_parser import parse_document
from app.services.claude import (
    SYSTEM_PROMPT as HTML_SYSTEM,
    TEACHER_KEY_SYSTEM,
    SLIDESHOW_SYSTEM,
    LESSON_PLAN_SYSTEM,
    _call_claude,
    _revise_html,
    build_prompt,
    GRADE_HINTS,
)

client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

CURRICULUM_DIR = Path(__file__).parent.parent.parent / "curriculum"

MARTY_SYSTEM = """You are MARTY, an intelligent teaching assistant for Jenn, \
a 9th and 10th grade English teacher at a U.S. public high school teaching English 1 and English 2.

You help Jenn create classroom materials, lesson plans, and teaching resources. \
You have tools to read her curriculum documents, generate student worksheets, teacher answer keys, \
slideshows, and lesson plans — and to save everything so she can download or print it.

Guidelines:
- Be conversational and efficient. Don't over-explain.
- When creating materials, always generate the student version, teacher answer key, and slideshow \
  together unless Jenn says otherwise.
- When creating a lesson plan, include timing for each section.
- Use read_document to pull in relevant curriculum before generating — don't guess at content.
- After saving an output, tell Jenn it's ready and what she can do with it (view, download, export to PPTX).
- If you need clarification (grade level, specific text, length), ask before generating.
- Refer to yourself as MARTY."""

MARTY_TOOLS = [
    {
        "name": "list_documents",
        "description": "List all curriculum documents Jenn has uploaded.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "read_document",
        "description": "Read the full text content of a curriculum document.",
        "input_schema": {
            "type": "object",
            "properties": {"doc_id": {"type": "integer", "description": "Document ID from list_documents"}},
            "required": ["doc_id"],
        },
    },
    {
        "name": "get_context",
        "description": "Get Jenn's active standing context notes (class overviews, preferences, student notes).",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_roster",
        "description": "Get the student roster.",
        "input_schema": {
            "type": "object",
            "properties": {
                "grade": {"type": "string", "enum": ["english1", "english2"], "description": "Filter by class"},
            },
            "required": [],
        },
    },
    {
        "name": "create_material",
        "description": (
            "Generate classroom material (worksheet, foldable, slideshow, study guide, or custom). "
            "Always generates student version + teacher answer key + slideshow unless variants specified. "
            "Returns an output_id for downloading or exporting."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Name for this workflow/material"},
                "type": {"type": "string", "enum": ["worksheet", "foldable", "slideshow", "study_guide", "custom"]},
                "grade": {"type": "string", "enum": ["english1", "english2", "both"]},
                "description": {"type": "string", "description": "What to create — topic, learning objective, specific activity"},
                "doc_ids": {"type": "array", "items": {"type": "integer"}, "description": "Curriculum doc IDs to reference"},
                "variants": {
                    "type": "array",
                    "items": {"type": "string", "enum": ["student", "teacher", "slideshow"]},
                    "description": "Which versions to generate. Defaults to all three.",
                },
            },
            "required": ["name", "type", "grade", "description"],
        },
    },
    {
        "name": "create_lesson_plan",
        "description": "Generate a structured lesson plan with objectives, timing, procedure, and differentiation notes.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Name for this lesson plan"},
                "grade": {"type": "string", "enum": ["english1", "english2", "both"]},
                "duration": {"type": "string", "description": "Class duration e.g. '50 minutes', '90 minutes'"},
                "description": {"type": "string", "description": "Topic, standards, learning goal, text being used"},
                "doc_ids": {"type": "array", "items": {"type": "integer"}, "description": "Curriculum docs to reference"},
            },
            "required": ["name", "grade", "description"],
        },
    },
    {
        "name": "revise_output",
        "description": "Revise an existing output version. Only regenerates the specified variants.",
        "input_schema": {
            "type": "object",
            "properties": {
                "output_id": {"type": "integer"},
                "instructions": {"type": "string", "description": "What to change"},
                "variants": {
                    "type": "array",
                    "items": {"type": "string", "enum": ["student", "teacher", "slideshow"]},
                },
            },
            "required": ["output_id", "instructions"],
        },
    },
    {
        "name": "list_recent_outputs",
        "description": "List recent saved outputs so Jenn can reference or revise them.",
        "input_schema": {
            "type": "object",
            "properties": {"limit": {"type": "integer", "description": "Number to return, default 10"}},
            "required": [],
        },
    },
]


# ── Tool implementations ────────────────────────────────────────────────────────

def _tool_list_documents() -> dict:
    db = get_db()
    rows = db.execute("SELECT id, title, filename, subject, grade FROM curriculum_docs ORDER BY added_at DESC").fetchall()
    db.close()
    return {"documents": [dict(r) for r in rows]}


def _tool_read_document(doc_id: int) -> dict:
    db = get_db()
    row = db.execute("SELECT * FROM curriculum_docs WHERE id=?", (doc_id,)).fetchone()
    db.close()
    if not row:
        return {"error": f"Document {doc_id} not found"}
    text = parse_document(row["filepath"])
    return {"id": doc_id, "title": row["title"] or row["filename"], "content": text}


def _tool_get_context() -> dict:
    db = get_db()
    rows = db.execute("SELECT title, content, category FROM context_notes WHERE active=1 ORDER BY category, title").fetchall()
    db.close()
    return {"context_notes": [dict(r) for r in rows]}


def _tool_get_roster(grade: str | None = None) -> dict:
    db = get_db()
    q = "SELECT id, name, grade FROM students WHERE active=1"
    params = []
    if grade:
        q += " AND grade=?"
        params.append(grade)
    q += " ORDER BY grade, name"
    rows = db.execute(q, params).fetchall()
    db.close()
    return {"students": [dict(r) for r in rows]}


def _tool_create_material(name, type_, grade, description, doc_ids=None, variants=None) -> dict:
    if variants is None:
        variants = ["student", "teacher", "slideshow"]
    if doc_ids is None:
        doc_ids = []

    db = get_db()
    cur = db.execute(
        "INSERT INTO workflows (name, type, grade, context, doc_ids) VALUES (?,?,?,?,?)",
        (name, type_, grade, description, json.dumps(doc_ids))
    )
    workflow_id = cur.lastrowid

    doc_rows = []
    if doc_ids:
        ph = ",".join("?" * len(doc_ids))
        doc_rows = [dict(r) for r in db.execute(f"SELECT * FROM curriculum_docs WHERE id IN ({ph})", doc_ids).fetchall()]

    context_notes = [dict(r) for r in db.execute(
        "SELECT * FROM context_notes WHERE active=1 ORDER BY category, title"
    ).fetchall()]

    version = 1
    db.commit()
    db.close()

    # Build workflow dict for prompt
    workflow = {"name": name, "type": type_, "grade": grade, "context": description, "instructions": None}

    prompt = build_prompt(workflow, doc_rows, context_notes)

    student_html = _call_claude(HTML_SYSTEM, prompt) if "student" in variants else ""

    db = get_db()
    cur = db.execute(
        "INSERT INTO outputs (workflow_id, version, html, status, notes) VALUES (?,?,?,'generating',?)",
        (workflow_id, version, student_html, name)
    )
    output_id = cur.lastrowid
    db.execute("UPDATE workflows SET updated_at=CURRENT_TIMESTAMP WHERE id=?", (workflow_id,))
    db.commit()
    db.close()

    teacher_html = None
    if "teacher" in variants:
        teacher_prompt = (
            f"Here is the student version:\n\n{student_html}\n\n"
            f"Context: {description}\n\nCreate the TEACHER ANSWER KEY version."
        )
        teacher_html = _call_claude(TEACHER_KEY_SYSTEM, teacher_prompt)
        db = get_db()
        db.execute("UPDATE outputs SET teacher_html=? WHERE id=?", (teacher_html, output_id))
        db.commit()
        db.close()

    slideshow_html = None
    slideshow_json_str = None
    if "slideshow" in variants:
        slideshow_prompt = (
            f"Student activity:\n\n{student_html}\n\nAssignment: {name}\n"
            f"Class: {GRADE_HINTS.get(grade, '')}\n\nCreate the slideshow."
        )
        slideshow_html = _call_claude(SLIDESHOW_SYSTEM, slideshow_prompt)
        slideshow_json_str = _extract_slide_json(name, slideshow_html, description)
        db = get_db()
        db.execute(
            "UPDATE outputs SET slideshow_html=?, slideshow_json=?, status='complete' WHERE id=?",
            (slideshow_html, slideshow_json_str, output_id)
        )
        db.commit()
        db.close()
    else:
        db = get_db()
        db.execute("UPDATE outputs SET status='complete' WHERE id=?", (output_id,))
        db.commit()
        db.close()

    return {
        "output_id": output_id,
        "workflow_id": workflow_id,
        "name": name,
        "variants_generated": variants,
        "message": f"'{name}' is ready. output_id={output_id}",
    }


def _tool_create_lesson_plan(name, grade, description, duration="50 minutes", doc_ids=None) -> dict:
    if doc_ids is None:
        doc_ids = []

    db = get_db()
    doc_rows = []
    if doc_ids:
        ph = ",".join("?" * len(doc_ids))
        doc_rows = [dict(r) for r in db.execute(f"SELECT * FROM curriculum_docs WHERE id IN ({ph})", doc_ids).fetchall()]
    context_notes = [dict(r) for r in db.execute(
        "SELECT * FROM context_notes WHERE active=1 ORDER BY category, title"
    ).fetchall()]
    db.close()

    doc_text = ""
    for d in doc_rows:
        doc_text += f"\n[{d['title'] or d['filename']}]\n{parse_document(d['filepath'])}\n"

    context_text = "\n".join(f"[{n['category']}] {n['title']}: {n['content']}" for n in context_notes)

    prompt = (
        f"Create a detailed lesson plan for Jenn's {GRADE_HINTS.get(grade, '')} class.\n\n"
        f"Class duration: {duration}\n"
        f"Topic / goal: {description}\n\n"
        f"STANDING CONTEXT:\n{context_text}\n\n"
        f"CURRICULUM DOCUMENTS:\n{doc_text}"
    )

    html = _call_claude(LESSON_PLAN_SYSTEM, prompt)

    db = get_db()
    cur = db.execute(
        "INSERT INTO workflows (name, type, grade, context, doc_ids) VALUES (?,?,?,?,?)",
        (name, "lesson_plan", grade, description, json.dumps(doc_ids))
    )
    workflow_id = cur.lastrowid
    cur2 = db.execute(
        "INSERT INTO outputs (workflow_id, version, html, status) VALUES (?,1,?,'complete')",
        (workflow_id, html)
    )
    output_id = cur2.lastrowid
    db.execute("UPDATE workflows SET updated_at=CURRENT_TIMESTAMP WHERE id=?", (workflow_id,))
    db.commit()
    db.close()

    return {"output_id": output_id, "workflow_id": workflow_id, "name": name, "message": f"Lesson plan '{name}' is ready. output_id={output_id}"}


def _tool_revise_output(output_id: int, instructions: str, variants=None) -> dict:
    if variants is None:
        variants = ["student", "teacher", "slideshow"]

    db = get_db()
    row = db.execute("SELECT * FROM outputs WHERE id=?", (output_id,)).fetchone()
    db.close()
    if not row:
        return {"error": f"Output {output_id} not found"}
    row = dict(row)

    db = get_db()
    version = db.execute(
        "SELECT COALESCE(MAX(version),0) FROM outputs WHERE workflow_id=?", (row["workflow_id"],)
    ).fetchone()[0] + 1
    db.close()

    student_html = _revise_html(row["html"], instructions, "student worksheet") if "student" in variants else row["html"]

    db = get_db()
    cur = db.execute(
        "INSERT INTO outputs (workflow_id, version, html, status) VALUES (?,?,?,'generating')",
        (row["workflow_id"], version, student_html)
    )
    new_output_id = cur.lastrowid
    db.commit()
    db.close()

    teacher_html = None
    if "teacher" in variants and row.get("teacher_html"):
        teacher_html = _revise_html(row["teacher_html"], instructions, "teacher answer key")
    elif row.get("teacher_html"):
        teacher_html = row["teacher_html"]

    db = get_db()
    db.execute("UPDATE outputs SET teacher_html=? WHERE id=?", (teacher_html, new_output_id))
    db.commit()
    db.close()

    slideshow_html = None
    if "slideshow" in variants and row.get("slideshow_html"):
        slideshow_html = _revise_html(row["slideshow_html"], instructions, "slideshow")
    elif row.get("slideshow_html"):
        slideshow_html = row["slideshow_html"]

    db = get_db()
    db.execute(
        "UPDATE outputs SET slideshow_html=?, status='complete' WHERE id=?",
        (slideshow_html, new_output_id)
    )
    db.commit()
    db.close()

    return {"output_id": new_output_id, "message": f"Revised output ready. output_id={new_output_id}"}


def _tool_list_recent_outputs(limit: int = 10) -> dict:
    db = get_db()
    rows = db.execute(
        "SELECT o.id, o.version, o.status, o.created_at, w.name, w.type, w.grade "
        "FROM outputs o JOIN workflows w ON w.id=o.workflow_id "
        "ORDER BY o.created_at DESC LIMIT ?", (limit,)
    ).fetchall()
    db.close()
    return {"outputs": [dict(r) for r in rows]}


def _extract_slide_json(name: str, slideshow_html: str, context: str) -> str:
    prompt = (
        f"Extract the slide structure from this HTML slideshow as JSON.\n\n"
        f"Return ONLY a JSON array, no explanation:\n"
        f'[{{"title": "...", "body": ["bullet1", "bullet2"], "notes": "teacher notes", "type": "title|content|activity|discussion"}}]\n\n'
        f"Slideshow HTML:\n{slideshow_html[:8000]}"
    )
    try:
        raw = _call_claude("Extract slide structure as JSON array only.", prompt, max_tokens=2048)
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        json.loads(raw)
        return raw
    except Exception:
        return json.dumps([{"title": name, "body": [context], "notes": "", "type": "title"}])


# ── Tool dispatch ───────────────────────────────────────────────────────────────

def _execute_tool(name: str, inputs: dict) -> str:
    try:
        if name == "list_documents":
            result = _tool_list_documents()
        elif name == "read_document":
            result = _tool_read_document(inputs["doc_id"])
        elif name == "get_context":
            result = _tool_get_context()
        elif name == "get_roster":
            result = _tool_get_roster(inputs.get("grade"))
        elif name == "create_material":
            result = _tool_create_material(
                inputs["name"], inputs["type"], inputs["grade"], inputs["description"],
                inputs.get("doc_ids", []), inputs.get("variants")
            )
        elif name == "create_lesson_plan":
            result = _tool_create_lesson_plan(
                inputs["name"], inputs["grade"], inputs["description"],
                inputs.get("duration", "50 minutes"), inputs.get("doc_ids", [])
            )
        elif name == "revise_output":
            result = _tool_revise_output(inputs["output_id"], inputs["instructions"], inputs.get("variants"))
        elif name == "list_recent_outputs":
            result = _tool_list_recent_outputs(inputs.get("limit", 10))
        else:
            result = {"error": f"Unknown tool: {name}"}
    except Exception as e:
        result = {"error": str(e)}
    return json.dumps(result)


# ── Message persistence helpers ─────────────────────────────────────────────────

def _save_message(conversation_id: int, api_role: str, api_content, display_role: str, display_content: str, tool_name: str | None = None, tool_use_id: str | None = None):
    db = get_db()
    db.execute(
        "INSERT INTO messages (conversation_id, api_role, api_content, display_role, display_content, tool_name, tool_use_id) "
        "VALUES (?,?,?,?,?,?,?)",
        (conversation_id, api_role, json.dumps(api_content), display_role, display_content, tool_name, tool_use_id)
    )
    db.execute("UPDATE conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=?", (conversation_id,))
    db.commit()
    db.close()


def _build_api_messages(conversation_id: int) -> list:
    db = get_db()
    rows = db.execute(
        "SELECT api_role, api_content FROM messages WHERE conversation_id=? ORDER BY id",
        (conversation_id,)
    ).fetchall()
    db.close()

    messages = []
    for row in rows:
        content = json.loads(row["api_content"])
        role = row["api_role"]
        if messages and messages[-1]["role"] == role:
            # Merge consecutive same-role content (tool_results go into user messages)
            existing = messages[-1]["content"]
            if isinstance(existing, list) and isinstance(content, list):
                existing.extend(content)
            else:
                messages.append({"role": role, "content": content})
        else:
            messages.append({"role": role, "content": content})
    return messages


# ── Agent loop ──────────────────────────────────────────────────────────────────

def run_agent(conversation_id: int, user_message: str):
    # Save user message
    _save_message(
        conversation_id,
        api_role="user",
        api_content=[{"type": "text", "text": user_message}],
        display_role="user",
        display_content=user_message,
    )

    # Auto-title the conversation on first user message
    db = get_db()
    msg_count = db.execute("SELECT COUNT(*) FROM messages WHERE conversation_id=?", (conversation_id,)).fetchone()[0]
    if msg_count <= 1:
        title = user_message[:60] + ("…" if len(user_message) > 60 else "")
        db.execute("UPDATE conversations SET title=? WHERE id=?", (title, conversation_id))
        db.commit()
    db.close()

    max_iterations = 10
    for _ in range(max_iterations):
        messages = _build_api_messages(conversation_id)

        response = client.messages.create(
            model="claude-opus-4-7",
            max_tokens=8192,
            system=MARTY_SYSTEM,
            tools=MARTY_TOOLS,
            messages=messages,
        )

        # Save the full assistant response (for API history)
        assistant_api_content = []
        text_parts = []
        tool_use_blocks = []

        for block in response.content:
            if block.type == "text":
                assistant_api_content.append({"type": "text", "text": block.text})
                text_parts.append(block.text)
            elif block.type == "tool_use":
                assistant_api_content.append({
                    "type": "tool_use",
                    "id": block.id,
                    "name": block.name,
                    "input": block.input,
                })
                tool_use_blocks.append(block)

        # Save assistant text if any
        if text_parts:
            _save_message(
                conversation_id,
                api_role="assistant",
                api_content=assistant_api_content,
                display_role="assistant",
                display_content="\n\n".join(text_parts),
            )
        elif tool_use_blocks:
            # No text, just tool calls — save the full content for API history but no display
            _save_message(
                conversation_id,
                api_role="assistant",
                api_content=assistant_api_content,
                display_role="assistant_silent",
                display_content="",
            )

        if response.stop_reason == "end_turn":
            break

        if response.stop_reason == "tool_use":
            tool_results_api = []

            for block in tool_use_blocks:
                # Save tool call for display
                input_summary = ", ".join(f"{k}={json.dumps(v)[:40]}" for k, v in block.input.items())
                _save_message(
                    conversation_id,
                    api_role="assistant",
                    api_content=[],
                    display_role="tool_call",
                    display_content=f"{block.name}({input_summary})",
                    tool_name=block.name,
                    tool_use_id=block.id,
                )

                result_str = _execute_tool(block.name, block.input)

                # Save tool result for display
                try:
                    result_obj = json.loads(result_str)
                    display_result = result_obj.get("message") or result_obj.get("error") or json.dumps(result_obj)[:200]
                except Exception:
                    display_result = result_str[:200]

                _save_message(
                    conversation_id,
                    api_role="user",
                    api_content=[{"type": "tool_result", "tool_use_id": block.id, "content": result_str}],
                    display_role="tool_result",
                    display_content=display_result,
                    tool_name=block.name,
                    tool_use_id=block.id,
                )

                tool_results_api.append({"type": "tool_result", "tool_use_id": block.id, "content": result_str})
