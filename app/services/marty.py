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
a 9th and 10th grade English teacher at a Texas public high school teaching English 1 and English 2.

You help Jenn build complete lesson day packages and individual classroom materials. \
You have tools to read curriculum documents, create and save all material types, and revise existing work.

## Material hierarchy
Everything you build belongs to a LESSON TOPIC. When starting a lesson day session:
1. Call create_topic first to create the topic record — save the returned topic_id.
2. Use that topic_id on every subsequent create_material / create_lesson_plan call.

## Creation order for a lesson day
Always build in this sequence so each piece can reference what already exists:
  a. Lesson plan (TEKS format — describes the full class flow)
  b. Worksheet and/or foldable — main student activities
  c. Slideshow — created LAST so it can accurately reference the materials above
     The slideshow automatically includes a Bell Ringer as slide 1 and an Exit Ticket as the last slide — do NOT create those as separate materials.

## Coherence rule — critical
The slideshow must ONLY reference handouts/materials that were actually created in this session.
When calling create_material for a slideshow, pass sibling_materials listing every material
name you created earlier in this session. Never mention a worksheet in the slideshow unless
it appears in sibling_materials.

## Other rules
- Worksheets and foldables always use variants=["student","teacher"] — always include the teacher key.
- Slideshows use variants=["slideshow"]. The bell ringer and exit ticket are built into every slideshow — do not create them as separate materials.
- Lesson plans use create_lesson_plan (not create_material).
- Use read_document to pull curriculum content before generating — don't guess.
- Be concise. Tell Jenn what's ready and what she can do with it.
- If you need one clarifying question before building, ask it briefly. Don't ask multiple questions.
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
        "name": "create_topic",
        "description": (
            "Create a lesson topic record. Call this first at the start of every lesson-day session "
            "before creating any materials. Returns a topic_id to pass to all subsequent material calls."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Lesson topic name, e.g. 'The Most Dangerous Game — Character Motivation'"},
                "grade": {"type": "string", "enum": ["english1", "english2", "both"]},
            },
            "required": ["name", "grade"],
        },
    },
    {
        "name": "create_material",
        "description": (
            "Generate a classroom material. "
            "Worksheets and foldables always use variants=['student','teacher']. "
            "Bell ringers and exit tickets use variants=['student']. "
            "Standalone slideshows use variants=['slideshow'] — create the slideshow LAST and pass sibling_materials "
            "listing every material already created so it only references what exists. "
            "Returns an output_id."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Name for this material"},
                "type": {"type": "string", "enum": ["worksheet", "foldable", "slideshow", "study_guide", "custom"]},
                "grade": {"type": "string", "enum": ["english1", "english2", "both"]},
                "description": {"type": "string", "description": "What to create — topic, learning objective, specific activity"},
                "doc_ids": {"type": "array", "items": {"type": "integer"}, "description": "Curriculum doc IDs to reference"},
                "variants": {
                    "type": "array",
                    "items": {"type": "string", "enum": ["student", "teacher", "slideshow"]},
                    "description": "Which versions to generate.",
                },
                "topic_id": {"type": "integer", "description": "Lesson topic ID from create_topic. Always provide this."},
                "sibling_materials": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Names of other materials already created in this session (used for slideshow coherence).",
                },
            },
            "required": ["name", "type", "grade", "description"],
        },
    },
    {
        "name": "create_lesson_plan",
        "description": "Generate a TEKS-aligned lesson plan with timing table and differentiation notes.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Name for this lesson plan"},
                "grade": {"type": "string", "enum": ["english1", "english2", "both"]},
                "duration": {"type": "string", "description": "Class duration e.g. '50 minutes', '90 minutes'"},
                "description": {"type": "string", "description": "Topic, TEKS standards to hit, learning goal, text being used"},
                "doc_ids": {"type": "array", "items": {"type": "integer"}, "description": "Curriculum docs to reference"},
                "topic_id": {"type": "integer", "description": "Lesson topic ID from create_topic. Always provide this."},
                "sibling_materials": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Names of materials being created in this session — include in the Materials section of the plan.",
                },
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
        "cache_control": {"type": "ephemeral"},
    },
]


# ── Tool implementations ────────────────────────────────────────────────────────

def _tool_create_topic(name: str, grade: str) -> dict:
    db = get_db()
    cur = db.execute(
        "INSERT INTO lesson_topics (name, grade) VALUES (?, ?)",
        (name, grade)
    )
    db.commit()
    topic_id = cur.lastrowid
    db.close()
    return {"topic_id": topic_id, "name": name, "message": f"Topic '{name}' created. Use topic_id={topic_id} in all material calls."}


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


def _tool_create_material(name, type_, grade, description, doc_ids=None, variants=None, topic_id=None, sibling_materials=None) -> dict:
    # Sensible defaults per type
    if variants is None:
        if type_ in ("worksheet", "foldable"):
            variants = ["student", "teacher"]
        elif type_ == "slideshow":
            variants = ["slideshow"]
        else:
            variants = ["student", "teacher"]
    if doc_ids is None:
        doc_ids = []

    db = get_db()
    cur = db.execute(
        "INSERT INTO workflows (name, type, grade, context, doc_ids, topic_id) VALUES (?,?,?,?,?,?)",
        (name, type_, grade, description, json.dumps(doc_ids), topic_id)
    )
    workflow_id = cur.lastrowid
    if topic_id:
        db.execute("UPDATE lesson_topics SET updated_at=CURRENT_TIMESTAMP WHERE id=?", (topic_id,))

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
        sibling_section = ""
        if sibling_materials:
            sibling_section = (
                "\n\nThis slideshow is part of a lesson that includes these student materials "
                "(reference them by name where appropriate):\n"
                + "\n".join(f"- {m}" for m in sibling_materials)
            )
        else:
            sibling_section = "\n\nDo NOT reference any worksheets or handouts — none were created for this lesson."

        context_html = student_html or f"Lesson topic: {description}"
        slideshow_prompt = (
            f"Assignment: {name}\n"
            f"Class: {GRADE_HINTS.get(grade, '')}\n"
            f"Description: {description}\n"
            f"{sibling_section}\n\n"
            f"Activity content:\n{context_html[:6000]}\n\nCreate the slideshow."
        )
        slideshow_html = _call_claude(SLIDESHOW_SYSTEM, slideshow_prompt)
        slideshow_json_str = _extract_slide_json(name, slideshow_html, description)
        # For type=slideshow, store the slideshow as primary content too (for display in OutputModal)
        primary_html = slideshow_html if not student_html else student_html
        db = get_db()
        db.execute(
            "UPDATE outputs SET html=?, slideshow_html=?, slideshow_json=?, status='complete' WHERE id=?",
            (primary_html, slideshow_html, slideshow_json_str, output_id)
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


def _tool_create_lesson_plan(name, grade, description, duration="50 minutes", doc_ids=None, topic_id=None, sibling_materials=None) -> dict:
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

    materials_section = ""
    if sibling_materials:
        materials_section = "\nMATERIALS BEING CREATED FOR THIS LESSON:\n" + "\n".join(f"- {m}" for m in sibling_materials) + "\n(Include these by name in the Materials and Time Breakdown sections of the plan.)\n"

    prompt = (
        f"Create a TEKS-aligned lesson plan for Jenn's {GRADE_HINTS.get(grade, '')} class.\n\n"
        f"Class duration: {duration}\n"
        f"Topic / goal: {description}\n"
        f"{materials_section}\n"
        f"STANDING CONTEXT:\n{context_text}\n\n"
        f"CURRICULUM DOCUMENTS:\n{doc_text}"
    )

    html = _call_claude(LESSON_PLAN_SYSTEM, prompt)

    db = get_db()
    cur = db.execute(
        "INSERT INTO workflows (name, type, grade, context, doc_ids, topic_id) VALUES (?,?,?,?,?,?)",
        (name, "lesson_plan", grade, description, json.dumps(doc_ids), topic_id)
    )
    workflow_id = cur.lastrowid
    if topic_id:
        db.execute("UPDATE lesson_topics SET updated_at=CURRENT_TIMESTAMP WHERE id=?", (topic_id,))
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
        elif name == "create_topic":
            result = _tool_create_topic(inputs["name"], inputs["grade"])
        elif name == "create_material":
            result = _tool_create_material(
                inputs["name"], inputs["type"], inputs["grade"], inputs["description"],
                inputs.get("doc_ids", []), inputs.get("variants"),
                inputs.get("topic_id"), inputs.get("sibling_materials"),
            )
        elif name == "create_lesson_plan":
            result = _tool_create_lesson_plan(
                inputs["name"], inputs["grade"], inputs["description"],
                inputs.get("duration", "50 minutes"), inputs.get("doc_ids", []),
                inputs.get("topic_id"), inputs.get("sibling_materials"),
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


def _with_cache_breakpoint(messages: list) -> list:
    """Mark the last content block of the last message as an ephemeral cache breakpoint.
    Each call re-marks the new tail, so the growing tool-use history and prior turns
    are served from cache instead of re-processed every iteration."""
    if not messages:
        return messages
    messages = list(messages)
    last = dict(messages[-1])
    content = last["content"]
    if isinstance(content, str):
        content = [{"type": "text", "text": content}]
    else:
        content = [dict(block) for block in content]
    content[-1] = {**content[-1], "cache_control": {"type": "ephemeral"}}
    last["content"] = content
    messages[-1] = last
    return messages


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


# ── Stop control ────────────────────────────────────────────────────────────────
# Cooperative cancellation: the agent loop only checks this between safe boundaries
# (before the next model call, and before each individual tool execution), it can't
# interrupt a model call or tool execution already in flight.

_stop_flags: set[int] = set()


def request_stop(conversation_id: int) -> None:
    _stop_flags.add(conversation_id)


def _consume_stop(conversation_id: int) -> bool:
    if conversation_id in _stop_flags:
        _stop_flags.discard(conversation_id)
        return True
    return False


# ── Agent loop ──────────────────────────────────────────────────────────────────

def run_agent(conversation_id: int, user_message: str):
    # Note: don't clear _stop_flags here — a stop requested just before this run
    # starts (e.g. the user double-clicks) must still be honored. Stale flags left
    # over from a run that ended normally (end_turn) are cleared where that happens.

    # Save user message
    _save_message(
        conversation_id,
        api_role="user",
        api_content=[{"type": "text", "text": user_message}],
        display_role="user",
        display_content=user_message,
    )

    # Auto-title only if still using the default title (frontend may have set a nicer one)
    db = get_db()
    conv_row = db.execute("SELECT title FROM conversations WHERE id=?", (conversation_id,)).fetchone()
    msg_count = db.execute("SELECT COUNT(*) FROM messages WHERE conversation_id=?", (conversation_id,)).fetchone()[0]
    if msg_count <= 1 and conv_row and conv_row["title"] in ("New Chat", "", None):
        # Skip long system-style prompts that start with a bracketed tag
        if not user_message.strip().startswith("["):
            title = user_message[:60] + ("…" if len(user_message) > 60 else "")
            db.execute("UPDATE conversations SET title=? WHERE id=?", (title, conversation_id))
            db.commit()
    db.close()

    max_iterations = 10
    for _ in range(max_iterations):
        if _consume_stop(conversation_id):
            _save_message(
                conversation_id,
                api_role="assistant",
                api_content=[{"type": "text", "text": "Stopped."}],
                display_role="assistant",
                display_content="⏹️ Stopped — pick back up whenever you're ready.",
            )
            return

        messages = _with_cache_breakpoint(_build_api_messages(conversation_id))

        response = client.messages.create(
            model="claude-sonnet-5",
            max_tokens=8192,
            system=[{"type": "text", "text": MARTY_SYSTEM, "cache_control": {"type": "ephemeral"}}],
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
            stopping = False

            for block in tool_use_blocks:
                if not stopping and _consume_stop(conversation_id):
                    stopping = True

                # Save tool call for display
                input_summary = ", ".join(f"{k}={json.dumps(v)[:40]}" for k, v in block.input.items())
                _save_message(
                    conversation_id,
                    api_role="assistant",
                    api_content=[],
                    display_role="tool_call",
                    display_content=f"{block.name}({input_summary})" if not stopping else f"{block.name}() — skipped",
                    tool_name=block.name,
                    tool_use_id=block.id,
                )

                if stopping:
                    result_str = json.dumps({"cancelled": True, "message": "Cancelled — Jenn stopped MARTY before this ran."})
                else:
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

            if stopping:
                _save_message(
                    conversation_id,
                    api_role="assistant",
                    api_content=[{"type": "text", "text": "Stopped."}],
                    display_role="assistant",
                    display_content="⏹️ Stopped — pick back up whenever you're ready.",
                )
                return

    # Run ended normally (end_turn or max_iterations) — drop any stop flag that
    # arrived too late to be honored, so it doesn't cancel the next run.
    _stop_flags.discard(conversation_id)
