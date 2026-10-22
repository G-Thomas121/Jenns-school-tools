"""
MARTY — a coding-agent-style loop over Jenn's workspace.

MARTY works the way a coding assistant works in a repo: it reads what's already there,
drafts and edits markdown files with small targeted edits, and keeps notes in MARTY.md.
Every API message and chat display line is saved to the DB, and live progress (streamed
text, documents as they're written) is published to the event broker for the SSE stream.

History is strictly append-only (thinking blocks are only valid when earlier turns are
replayed unchanged), so per-turn context — memory, file list, date — rides along in each
new user message instead of the system prompt.
"""
import json
import os
import time
from datetime import date

import jiter
from anthropic import Anthropic

from app.database import get_db
from app.services.events import broker
from app.services.workspace import MEMORY_FILE, Workspace, WorkspaceError, get_workspace

MODEL = os.getenv("MARTY_MODEL", "claude-opus-5-5")
MAX_TOKENS = 64000
MAX_ITERATIONS = 25
MAX_LISTED_FILES = 300
MAX_STREAM_ATTEMPTS = 3
DRAFT_INTERVAL = 0.15  # seconds between live document snapshots sent to the UI

# With display "updates", the short notes MARTY writes between tool calls ("Checking the lesson
# plan first…") come back as thinking-block text while its reasoning stays hidden. Without it
# they come back empty and long turns look silent.
THINKING = {"type": "adaptive", "display": "updates"}
BETAS = ["server-side-fallback-2026-07-01", "thinking-display-updates-2026-08-18"]
# Stands in for unfinished work when a response is cut off — not a real update.
INTERRUPTED_NOTE = "This part of the response was interrupted before it finished."

SYSTEM_PROMPT = """You are MARTY, a teaching assistant for Jenn, who teaches 9th grade English 1 and \
10th grade English 2 at a Texas public high school. You work in her workspace: a folder of markdown \
files, much like a coding assistant works in a code repository.

## The workspace
- `MARTY.md` — your memory. Its contents are included with each of Jenn's messages.
- `curriculum/` — Jenn's uploaded reference files (PDF, DOCX, text). Read-only; read them before \
building on them instead of guessing at their contents.
- `lessons/<lesson-slug>/` — one folder per lesson, e.g. `lessons/most-dangerous-game-motivation/`. \
Typical files: `lesson-plan.md`, `worksheet.md`, `worksheet-key.md`, `foldable.md`, `slides.md`.
- `lessons/<lesson-slug>/sources/` — files Jenn uploaded for that lesson, often a whole folder of \
PDFs. Read-only, like `curriculum/`.
- `_index.md` — any folder Jenn uploaded has one, with a one-line summary per file. Read it first, \
then open only the files you need, or use `search_files` to find a passage across all of them \
(the hit's line number works as `start_line` for `read_file`). Files flagged as scanned have \
little readable text; ask Jenn about them rather than guessing.

Jenn sees whichever file you last wrote or edited in a document pane next to the chat, rendered as \
formatted markdown. So don't paste a whole document into chat; write it to the file and use chat \
to summarize what you did, call out choices she might want to change, and ask what's next.

## How Jenn works
1. She starts with a **lesson plan**. Ask the one or two things you genuinely need (class, text, \
class length, goal) if they aren't clear from her message or memory, then draft `lesson-plan.md`: \
TEKS standards (codes like ELA.9.x.X / ELA.10.x.X), a one-sentence objective, materials, a timed \
lesson breakdown table (minutes, phase, what the teacher and students do, materials used), and \
differentiation notes.
2. Then **materials**, one at a time — worksheets, foldables, study guides, bell ringers, exit \
tickets. These are drafts you iterate on together in chat. Expect several rounds of feedback; apply \
each one with `edit_file` rather than rewriting the file. When a student-facing material has answers, \
keep a matching answer key in a separate `-key.md` file and keep it in sync when the material changes.
3. **Slides** come last, built on what actually exists in the lesson folder. Read the lesson plan and \
materials first, and only reference handouts that are really there. Jenn downloads `slides.md` \
as a PowerPoint file and imports it into Canva, where each section becomes one page, so write it in \
that shape: one `## Slide N — Title` section per slide with short on-slide text (a few bullets, a \
short table, or a line or two; anything longer gets shrunk to fit), plus a `> Notes:` line for \
anything she'd say aloud, which becomes speaker notes. Open with a Bell Ringer and close with an \
Exit Ticket.

## Writing materials
- Student-facing materials are written to the student: clear directions, age-appropriate language, \
and visible answer space (e.g. `____________` lines, or a table with empty cells).
- A foldable is laid out panel by panel (`### Panel 1 — Front: ...`), with what goes on each flap.
- Keep everything aligned with her curriculum files and the lesson plan.

## Memory
Use `remember` when Jenn tells you something that should carry into future chats: a preference \
("I like vocab boxes"), a fact about her classes ("3rd period is an inclusion class"), or a correction \
to how you work. Don't save one-off details about the current lesson. You can also reorganize \
`MARTY.md` with `edit_file` if it gets messy.

## Style
Be warm and concise. Refer to yourself as MARTY. Jenn watches you work, so before each step that \
takes a while (reading her files, drafting or revising a document), say in one short sentence what \
you're about to do and why, for example: Reading the lesson plan so the exit ticket matches the objective."""


def _tool(name: str, description: str, properties: dict, required: list[str]) -> dict:
    return {
        "name": name,
        "description": description,
        # Stream tool inputs as they're generated so documents appear live. The API doesn't
        # validate eagerly streamed inputs, so validate_input() does.
        "eager_input_streaming": True,
        "input_schema": {
            "type": "object",
            "properties": properties,
            "required": required,
            "additionalProperties": False,
        },
    }


PATH = {"type": "string", "description": "Path relative to the workspace root, e.g. lessons/gatsby-ch3/worksheet.md"}

TOOLS = [
    _tool("list_files", "List every file in the workspace.", {}, []),
    _tool(
        "read_file",
        "Read a workspace file. PDF and DOCX files are returned as extracted text, with PDF pages "
        "marked \"--- Page N ---\". Long files come back in pieces; the result says which "
        "start_line to pass to keep reading.",
        {"path": PATH,
         "start_line": {"type": "integer", "description": "1-based line to start from (default 1), "
                                                          "e.g. a line number from search_files"}},
        ["path"],
    ),
    _tool(
        "write_file",
        "Create a markdown file, or replace one entirely. Prefer edit_file for changes to an existing file.",
        {"path": PATH, "content": {"type": "string", "description": "Full markdown content"}},
        ["path", "content"],
    ),
    _tool(
        "edit_file",
        "Replace one exact passage in a file. old_text must appear exactly once — include enough "
        "surrounding text to make it unique. Make several calls for several changes.",
        {"path": PATH, "old_text": {"type": "string"}, "new_text": {"type": "string"}},
        ["path", "old_text", "new_text"],
    ),
    _tool(
        "search_files",
        "Case-insensitive text search across all workspace files. Returns matching lines.",
        {"query": {"type": "string"}}, ["query"],
    ),
    _tool(
        "remember",
        "Save a durable note about Jenn or her classes to MARTY.md for future chats.",
        {"note": {"type": "string", "description": "One concise sentence"}}, ["note"],
    ),
]


# ── Tool execution ─────────────────────────────────────────────────────────────

_SCHEMAS = {t["name"]: t["input_schema"] for t in TOOLS}


def validate_input(name: str, args) -> str | None:
    """Check a tool input against its schema. Returns an error message, or None if valid."""
    schema = _SCHEMAS.get(name)
    if schema is None:
        return f"Unknown tool: {name}"
    if not isinstance(args, dict):
        return "Input must be an object"
    missing = [k for k in schema["required"] if k not in args]
    extra = [k for k in args if k not in schema["properties"]]
    wrong = [k for k, v in args.items() if k in schema["properties"] and not _is_type(v, schema["properties"][k]["type"])]
    if missing or extra or wrong:
        return json.dumps({"INVALID_INPUT": args, "missing": missing, "unexpected": extra, "wrong_type": wrong})
    return None


def _is_type(value, json_type: str) -> bool:
    if json_type == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    return isinstance(value, str)


def execute_tool(ws: Workspace, name: str, args: dict) -> tuple[str, str, str | None]:
    """Run a tool. Returns (result for the model, one-line summary for chat, file path shown)."""
    if name == "list_files":
        return "\n".join(ws.list_files()), "Looked through the workspace", None
    if name == "read_file":
        return ws.read_lines(args["path"], args.get("start_line", 1)), f"Read {args['path']}", args["path"]
    if name == "write_file":
        ws.write(args["path"], args["content"])
        return f"Wrote {args['path']}", f"Wrote {args['path']}", args["path"]
    if name == "edit_file":
        ws.edit(args["path"], args["old_text"], args["new_text"])
        return f"Edited {args['path']}", f"Edited {args['path']}", args["path"]
    if name == "search_files":
        hits = ws.search(args["query"])[:100]
        result = "\n".join(f"{h['path']}:{h['line']}: {h['text']}" for h in hits) or "No matches."
        return result, f"Searched for “{args['query']}”", None
    if name == "remember":
        ws.remember(args["note"])
        return "Saved to memory.", f"Remembered: {args['note']}", MEMORY_FILE
    raise WorkspaceError(f"Unknown tool: {name}")


# ── Persistence ────────────────────────────────────────────────────────────────

def _save(conversation_id, *, api_role=None, api_content=None, display_role=None, display_content="", path=None):
    db = get_db()
    cur = db.execute(
        "INSERT INTO messages (conversation_id, api_role, api_content, display_role, display_content, path) "
        "VALUES (?,?,?,?,?,?)",
        (conversation_id, api_role, json.dumps(api_content) if api_content is not None else None,
         display_role, display_content, path),
    )
    db.execute("UPDATE conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=?", (conversation_id,))
    db.commit()
    row = db.execute(
        "SELECT id, display_role, display_content, path, created_at FROM messages WHERE id=?", (cur.lastrowid,)
    ).fetchone()
    db.close()
    if display_role:
        broker.publish(conversation_id, {"type": "message", "message": dict(row)})


def _load_history(conversation_id: int) -> list[dict]:
    db = get_db()
    rows = db.execute(
        "SELECT api_role, api_content FROM messages WHERE conversation_id=? AND api_role IS NOT NULL ORDER BY id",
        (conversation_id,),
    ).fetchall()
    db.close()
    return [{"role": r["api_role"], "content": json.loads(r["api_content"])} for r in rows]


def _maybe_title(conversation_id: int, user_message: str) -> None:
    db = get_db()
    row = db.execute("SELECT title FROM conversations WHERE id=?", (conversation_id,)).fetchone()
    if row and row["title"] == "New Chat":
        title = user_message.strip().splitlines()[0][:60]
        db.execute("UPDATE conversations SET title=? WHERE id=?", (title, conversation_id))
        db.commit()
    db.close()


def _workspace_context(ws: Workspace) -> str:
    files = ws.list_files()
    listed = "\n".join(files[:MAX_LISTED_FILES])
    if len(files) > MAX_LISTED_FILES:
        listed += f"\n… and {len(files) - MAX_LISTED_FILES} more (use list_files)"
    return (
        f"<workspace_context>\nToday is {date.today():%A, %B %-d, %Y}.\n\n"
        f"<memory path=\"{MEMORY_FILE}\">\n{ws.memory()}\n</memory>\n\n"
        f"<files>\n{listed}\n</files>\n</workspace_context>"
    )


# ── Stop control ───────────────────────────────────────────────────────────────
# Cooperative: checked before each model call and each tool, never mid-call.

_stop_flags: set[int] = set()


def request_stop(conversation_id: int) -> None:
    _stop_flags.add(conversation_id)


def _consume_stop(conversation_id: int) -> bool:
    if conversation_id in _stop_flags:
        _stop_flags.discard(conversation_id)
        return True
    return False


STOPPED = "⏹️ Stopped — pick back up whenever you're ready."


# ── Agent loop ─────────────────────────────────────────────────────────────────

def run_agent(conversation_id: int, user_message: str, *, client=None, workspace: Workspace | None = None):
    client = client or Anthropic()
    ws = workspace or get_workspace()

    _maybe_title(conversation_id, user_message)
    _save(
        conversation_id,
        api_role="user",
        api_content=[{"type": "text", "text": _workspace_context(ws)}, {"type": "text", "text": user_message}],
        display_role="user",
        display_content=user_message,
    )

    try:
        _loop(conversation_id, client, ws)
    finally:
        _stop_flags.discard(conversation_id)
        ws.commit(f"MARTY: {user_message.strip().splitlines()[0][:60]}")


def _loop(conversation_id: int, client, ws: Workspace):
    for _ in range(MAX_ITERATIONS):
        if _consume_stop(conversation_id):
            _save(conversation_id, display_role="assistant", display_content=STOPPED)
            return

        response = _stream_response(conversation_id, client)
        content = [b.model_dump(exclude_none=True) for b in response.content]
        said = "\n\n".join(b["text"] for b in content if b["type"] == "text").strip()
        tool_uses = [b for b in content if b["type"] == "tool_use"]

        if response.stop_reason == "refusal":
            # A refusal can cut a tool call off mid-input: never run it, and don't keep a
            # tool_use in history that has no matching result.
            if content and not tool_uses:
                _save(conversation_id, api_role="assistant", api_content=content)
            broker.publish(conversation_id, {"type": "reset"})
            _save(conversation_id, display_role="error",
                  display_content="MARTY couldn't help with that request. Try rephrasing it?")
            return

        if content:
            _save(conversation_id, api_role="assistant", api_content=content,
                  display_role="assistant" if said else None, display_content=said)

        if not tool_uses:
            if response.stop_reason == "max_tokens":
                _save(conversation_id, display_role="error",
                      display_content="MARTY ran out of room mid-reply. Ask it to continue.")
            return

        results = []
        stopping = False
        for block in tool_uses:
            stopping = stopping or _consume_stop(conversation_id)
            if stopping:
                results.append(_result(block, "Cancelled — Jenn stopped MARTY.", error=True))
                continue
            if response.stop_reason == "max_tokens":
                results.append(_result(
                    block, "Your output was cut off before this call finished, so it did not run. "
                           "Write large files in smaller pieces (write a first part, then edit_file to add more).",
                    error=True))
                continue
            invalid = validate_input(block["name"], block["input"])
            if invalid:
                results.append(_result(block, invalid, error=True))
                continue
            try:
                result, summary, path = execute_tool(ws, block["name"], block["input"])
                results.append(_result(block, result))
                _save(conversation_id, display_role="tool", display_content=summary, path=path)
            except WorkspaceError as e:
                results.append(_result(block, str(e), error=True))

        _save(conversation_id, api_role="user", api_content=results)

        if stopping:
            _save(conversation_id, display_role="assistant", display_content=STOPPED)
            return

    _save(conversation_id, display_role="error",
          display_content="MARTY took too many steps on that one. Tell it how to continue.")


def _stream_response(conversation_id: int, client):
    """Make one model call, publishing text and documents live as they stream in."""
    for _ in range(MAX_STREAM_ATTEMPTS):
        try:
            with client.beta.messages.stream(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
                tools=TOOLS,
                messages=_load_history(conversation_id),
                cache_control={"type": "ephemeral"},
                thinking=THINKING,
                output_config={"effort": "medium"},
                betas=BETAS,
                fallbacks="default",
            ) as stream:
                tool_name, raw, announced, last_draft = None, "", False, 0.0
                for event in stream:
                    if event.type == "content_block_start":
                        block = event.content_block
                        tool_name = block.name if block.type == "tool_use" else None
                        raw, announced = "", False
                    elif event.type == "text":
                        broker.publish(conversation_id, {"type": "delta", "text": event.text})
                    elif event.type == "thinking":
                        note = event.snapshot.strip()
                        if note and not INTERRUPTED_NOTE.startswith(note):
                            broker.publish(conversation_id, {"type": "thinking", "text": note})
                    elif event.type == "input_json" and tool_name in ("write_file", "edit_file"):
                        raw += event.partial_json
                        if tool_name == "edit_file" and announced:
                            continue
                        now = time.monotonic()
                        if announced and now - last_draft < DRAFT_INTERVAL:
                            continue
                        # The SDK's own snapshot drops unfinished strings, which would hide the
                        # document until it's complete — parse the raw fragments instead.
                        draft = _draft(tool_name, _parse_partial(raw))
                        if draft:
                            broker.publish(conversation_id, {"type": "draft", **draft})
                            announced, last_draft = True, now
                final = stream.get_final_message()
                if tool_name == "write_file" and announced:
                    # The throttle may have skipped the tail; send the finished document.
                    draft = _draft(tool_name, _parse_partial(raw))
                    if draft:
                        broker.publish(conversation_id, {"type": "draft", **draft})
                return final
        except ValueError:
            # The SDK couldn't parse a streamed tool input. There's no tool_use id to answer,
            # so drop what was streamed and ask again.
            broker.publish(conversation_id, {"type": "reset"})
    raise RuntimeError("MARTY's reply came back garbled several times in a row. Try again?")


def _parse_partial(raw: str):
    try:
        return jiter.from_json(raw.encode(), partial_mode="trailing-strings")
    except ValueError:
        return None


def _draft(tool_name: str, snapshot) -> dict | None:
    """The file a partially-streamed write/edit targets, once its path is complete.
    Keys stream in order, so the path is complete as soon as another key follows it."""
    if not isinstance(snapshot, dict):
        return None
    keys = list(snapshot)
    path = snapshot.get("path")
    if not isinstance(path, str) or keys[-1] == "path":
        return None
    if tool_name == "write_file":
        content = snapshot.get("content")
        return {"path": path, "content": content} if isinstance(content, str) else None
    return {"path": path, "content": None}


def _result(block: dict, content: str, error: bool = False) -> dict:
    r = {"type": "tool_result", "tool_use_id": block["id"], "content": content}
    if error:
        r["is_error"] = True
    return r
