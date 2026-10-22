"""
The agent loop, driven by a scripted fake Anthropic client so no real API calls happen.
"""
import copy
import json
import subprocess
from types import SimpleNamespace

import jiter
import pytest
from anthropic.types.beta import BetaMessage

from app.database import get_db
from app.services import agent
from app.services.events import broker


class FakeStream:
    """Mimics the SDK's MessageStream: iterating yields the same event shapes the real
    stream does (content_block_start / text / input_json), then get_final_message()."""

    def __init__(self, message):
        self.message = message

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def __iter__(self):
        for i, block in enumerate(self.message.content):
            yield SimpleNamespace(type="content_block_start", index=i, content_block=block)
            if block.type == "thinking" and block.thinking:
                mid = len(block.thinking) // 2
                for end in (mid, len(block.thinking)):
                    yield SimpleNamespace(type="thinking", thinking="", snapshot=block.thinking[:end])
            elif block.type == "text":
                mid = len(block.text) // 2
                for chunk in (block.text[:mid], block.text[mid:]):
                    yield SimpleNamespace(type="text", text=chunk)
            elif block.type == "tool_use":
                # Like the real API: raw JSON in small fragments. Like the real SDK: the
                # snapshot omits strings that haven't finished streaming.
                raw, sent = json.dumps(block.input), ""
                for start in range(0, len(raw), 7):
                    sent += raw[start:start + 7]
                    snapshot = jiter.from_json(sent.encode(), partial_mode="on") if sent else {}
                    yield SimpleNamespace(type="input_json", partial_json=raw[start:start + 7], snapshot=snapshot)

    def get_final_message(self):
        return self.message


class FakeClient:
    """Streams scripted responses in order and records every request it receives.
    A scripted exception is raised from the stream instead (like a JSON parse failure)."""

    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls = []
        self.beta = self
        self.messages = self

    def stream(self, **kwargs):
        self.calls.append(copy.deepcopy(kwargs))
        nxt = self.responses.pop(0)
        if isinstance(nxt, Exception):
            raise nxt
        return FakeStream(nxt)


@pytest.fixture
def events(conv_id, monkeypatch):
    """Everything the agent publishes for this conversation, in order."""
    monkeypatch.setattr(agent, "DRAFT_INTERVAL", 0)
    q = broker.subscribe(conv_id)
    out = []

    def collected():
        while not q.empty():
            out.append(q.get_nowait())
        return out
    yield collected
    broker.unsubscribe(conv_id, q)


def reply(*blocks, stop_reason=None):
    if stop_reason is None:
        stop_reason = "tool_use" if any(b["type"] == "tool_use" for b in blocks) else "end_turn"
    return BetaMessage.model_validate({
        "id": "msg", "type": "message", "role": "assistant", "model": agent.MODEL,
        "stop_reason": stop_reason, "stop_sequence": None,
        "usage": {"input_tokens": 1, "output_tokens": 1},
        "content": list(blocks),
    })


def text(t):
    return {"type": "text", "text": t}


def tool(name, id="t1", **input):
    return {"type": "tool_use", "id": id, "name": name, "input": input}


def thinking(sig="sig-1", text=""):
    return {"type": "thinking", "thinking": text, "signature": sig}


@pytest.fixture
def conv_id():
    db = get_db()
    cur = db.execute("INSERT INTO conversations (title) VALUES ('New Chat')")
    db.commit()
    db.close()
    return cur.lastrowid


def displayed(conv_id):
    db = get_db()
    rows = db.execute(
        "SELECT display_role, display_content, path FROM messages "
        "WHERE conversation_id=? AND display_role IS NOT NULL ORDER BY id",
        (conv_id,),
    ).fetchall()
    db.close()
    return [dict(r) for r in rows]


def git_log(ws):
    return subprocess.run(
        ["git", "log", "--format=%s"], cwd=ws.root, capture_output=True, text=True
    ).stdout.splitlines()


# ── Basic chat ─────────────────────────────────────────────────────────────────

def test_plain_reply_is_saved_and_displayed(conv_id, workspace):
    fake = FakeClient(reply(text("Hi Jenn! What are we teaching?")))
    agent.run_agent(conv_id, "hello", client=fake, workspace=workspace)

    assert displayed(conv_id) == [
        {"display_role": "user", "display_content": "hello", "path": None},
        {"display_role": "assistant", "display_content": "Hi Jenn! What are we teaching?", "path": None},
    ]


def test_request_uses_cached_system_prompt_and_tools(conv_id, workspace):
    fake = FakeClient(reply(text("ok")))
    agent.run_agent(conv_id, "hello", client=fake, workspace=workspace)

    call = fake.calls[0]
    assert call["model"] == agent.MODEL
    assert call["max_tokens"] == 64000
    assert call["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert {t["name"] for t in call["tools"]} == {
        "list_files", "read_file", "write_file", "edit_file", "search_files", "remember",
    }
    # Tool inputs (whole documents) stream as they're written instead of arriving in one burst.
    assert all(t["eager_input_streaming"] for t in call["tools"])
    # Progress notes between tool calls come back as text; reasoning stays hidden.
    assert call["thinking"] == {"type": "adaptive", "display": "updates"}
    assert "thinking-display-updates-2026-08-18" in call["betas"]


def test_user_turn_carries_memory_and_file_list(conv_id, workspace):
    workspace.remember("Likes vocab boxes on worksheets")
    workspace.write("lessons/gatsby/lesson-plan.md", "# Gatsby")
    fake = FakeClient(reply(text("ok")))
    agent.run_agent(conv_id, "make a worksheet", client=fake, workspace=workspace)

    user_content = fake.calls[0]["messages"][0]["content"]
    context, message = user_content[0]["text"], user_content[1]["text"]
    assert "Likes vocab boxes on worksheets" in context
    assert "lessons/gatsby/lesson-plan.md" in context
    assert message == "make a worksheet"


def test_first_message_titles_the_conversation(conv_id, workspace):
    agent.run_agent(conv_id, "Gatsby chapter 3 lesson", client=FakeClient(reply(text("ok"))), workspace=workspace)
    db = get_db()
    title = db.execute("SELECT title FROM conversations WHERE id=?", (conv_id,)).fetchone()[0]
    db.close()
    assert title == "Gatsby chapter 3 lesson"


# ── Tools ──────────────────────────────────────────────────────────────────────

def test_write_file_tool_creates_file_shows_it_and_commits(conv_id, workspace):
    fake = FakeClient(
        reply(text("Drafting the plan."), tool("write_file", path="lessons/gatsby/lesson-plan.md", content="# Plan")),
        reply(text("Plan's ready — take a look.")),
    )
    agent.run_agent(conv_id, "Write a Gatsby lesson plan", client=fake, workspace=workspace)

    assert workspace.read("lessons/gatsby/lesson-plan.md") == "# Plan"
    rows = displayed(conv_id)
    assert {"display_role": "tool", "display_content": "Wrote lessons/gatsby/lesson-plan.md",
            "path": "lessons/gatsby/lesson-plan.md"} in rows
    assert rows[-1]["display_content"] == "Plan's ready — take a look."
    assert git_log(workspace)[0] == "MARTY: Write a Gatsby lesson plan"


def test_tool_results_are_sent_back_in_one_user_message(conv_id, workspace):
    workspace.write("lessons/a.md", "A")
    workspace.write("lessons/b.md", "B")
    fake = FakeClient(
        reply(tool("read_file", id="t1", path="lessons/a.md"), tool("read_file", id="t2", path="lessons/b.md")),
        reply(text("done")),
    )
    agent.run_agent(conv_id, "read both", client=fake, workspace=workspace)

    results = fake.calls[1]["messages"][-1]
    assert results["role"] == "user"
    assert [(r["tool_use_id"], r["content"]) for r in results["content"]] == [("t1", "A"), ("t2", "B")]


def test_tool_error_is_reported_to_model_and_loop_continues(conv_id, workspace):
    fake = FakeClient(
        reply(tool("edit_file", path="lessons/missing.md", old_text="a", new_text="b")),
        reply(text("That file doesn't exist yet.")),
    )
    agent.run_agent(conv_id, "fix it", client=fake, workspace=workspace)

    result = fake.calls[1]["messages"][-1]["content"][0]
    assert result["is_error"] is True
    assert "not found" in result["content"]
    assert displayed(conv_id)[-1]["display_content"] == "That file doesn't exist yet."


def test_read_file_can_start_partway_through(conv_id, workspace):
    workspace.write("lessons/a/plan.md", "one\ntwo\nthree")
    fake = FakeClient(reply(tool("read_file", path="lessons/a/plan.md", start_line=2)), reply(text("ok")))
    agent.run_agent(conv_id, "go", client=fake, workspace=workspace)
    assert fake.calls[1]["messages"][-1]["content"][0]["content"] == "two\nthree"


@pytest.mark.parametrize("start_line", ["2", True])
def test_read_file_start_line_must_be_a_number(conv_id, workspace, start_line):
    workspace.write("lessons/a/plan.md", "one")
    fake = FakeClient(reply(tool("read_file", path="lessons/a/plan.md", start_line=start_line)), reply(text("ok")))
    agent.run_agent(conv_id, "go", client=fake, workspace=workspace)
    assert "INVALID_INPUT" in fake.calls[1]["messages"][-1]["content"][0]["content"]


def test_remember_tool_updates_memory(conv_id, workspace):
    fake = FakeClient(
        reply(tool("remember", note="3rd period is an inclusion class")),
        reply(text("Noted.")),
    )
    agent.run_agent(conv_id, "fyi 3rd period is inclusion", client=fake, workspace=workspace)
    assert "- 3rd period is an inclusion class" in workspace.memory()


# ── History ────────────────────────────────────────────────────────────────────

def test_history_is_append_only_and_keeps_thinking_blocks(conv_id, workspace):
    """Thinking blocks are only valid if earlier turns are replayed byte-for-byte."""
    fake = FakeClient(
        reply(thinking("sig-a"), tool("list_files")),
        reply(text("first answer")),
        reply(text("second answer")),
    )
    agent.run_agent(conv_id, "one", client=fake, workspace=workspace)
    agent.run_agent(conv_id, "two", client=fake, workspace=workspace)

    second_run_msgs = fake.calls[2]["messages"]
    first_run_msgs = fake.calls[1]["messages"]
    assert second_run_msgs[: len(first_run_msgs)] == first_run_msgs
    assert second_run_msgs[1]["content"][0] == {"type": "thinking", "thinking": "", "signature": "sig-a"}
    assert [m["role"] for m in second_run_msgs] == ["user", "assistant", "user", "assistant", "user"]


# ── Edge cases ─────────────────────────────────────────────────────────────────

def test_stop_request_skips_pending_tools(conv_id, workspace):
    fake = FakeClient(reply(tool("write_file", path="lessons/x.md", content="x")))
    agent.request_stop(conv_id)
    agent.run_agent(conv_id, "go", client=fake, workspace=workspace)

    assert fake.calls == []  # stopped before the first model call
    assert displayed(conv_id)[-1]["display_role"] == "assistant"
    assert "Stopped" in displayed(conv_id)[-1]["display_content"]


def test_cut_off_tool_call_is_answered_with_error(conv_id, workspace):
    fake = FakeClient(
        reply(tool("write_file", path="lessons/x.md", content="trunc"), stop_reason="max_tokens"),
        reply(text("I'll write it in smaller pieces.")),
    )
    agent.run_agent(conv_id, "big worksheet", client=fake, workspace=workspace)

    assert "lessons/x.md" not in workspace.list_files()
    result = fake.calls[1]["messages"][-1]["content"][0]
    assert result["is_error"] is True


def test_refusal_shows_friendly_message(conv_id, workspace):
    fake = FakeClient(reply(stop_reason="refusal"))
    agent.run_agent(conv_id, "something", client=fake, workspace=workspace)
    assert displayed(conv_id)[-1]["display_role"] == "error"


def test_refusal_mid_tool_call_runs_nothing_and_leaves_no_dangling_tool_use(conv_id, workspace):
    fake = FakeClient(
        reply(tool("write_file", path="lessons/x.md", content="half"), stop_reason="refusal"),
        reply(text("ok")),
    )
    agent.run_agent(conv_id, "first", client=fake, workspace=workspace)
    agent.run_agent(conv_id, "second", client=fake, workspace=workspace)

    assert "lessons/x.md" not in workspace.list_files()
    sent = fake.calls[1]["messages"]
    assert not any(b.get("type") == "tool_use" for m in sent for b in m["content"])


# ── Validation (streamed tool inputs aren't validated by the API) ──────────────

@pytest.mark.parametrize("bad_input", [
    {"path": "lessons/x.md"},                       # missing content
    {"path": "lessons/x.md", "content": 42},        # wrong type
    {"path": "lessons/x.md", "content": "x", "extra": "y"},
])
def test_invalid_tool_input_is_rejected_without_running(conv_id, workspace, bad_input):
    fake = FakeClient(reply(tool("write_file", **bad_input)), reply(text("retrying")))
    agent.run_agent(conv_id, "go", client=fake, workspace=workspace)

    assert "lessons/x.md" not in workspace.list_files()
    result = fake.calls[1]["messages"][-1]["content"][0]
    assert result["is_error"] is True
    assert "INVALID_INPUT" in result["content"]


def test_unparseable_stream_is_retried(conv_id, workspace, events):
    fake = FakeClient(ValueError("Unable to parse tool parameter JSON"), reply(text("Here you go")))
    agent.run_agent(conv_id, "go", client=fake, workspace=workspace)

    assert len(fake.calls) == 2
    assert {"type": "reset"} in events()  # tells the UI to drop the half-streamed text
    assert displayed(conv_id)[-1]["display_content"] == "Here you go"


# ── Live events ────────────────────────────────────────────────────────────────

def test_text_streams_as_deltas(conv_id, workspace, events):
    agent.run_agent(conv_id, "hi", client=FakeClient(reply(text("Hello Jenn!"))), workspace=workspace)
    deltas = [e["text"] for e in events() if e["type"] == "delta"]
    assert len(deltas) > 1
    assert "".join(deltas) == "Hello Jenn!"


def test_saved_chat_rows_are_published_with_their_ids(conv_id, workspace, events):
    agent.run_agent(conv_id, "hi", client=FakeClient(reply(text("Hello"))), workspace=workspace)
    published = [e["message"] for e in events() if e["type"] == "message"]
    assert [(m["display_role"], m["display_content"]) for m in published] == [("user", "hi"), ("assistant", "Hello")]
    assert published[0]["id"] < published[1]["id"]


def test_document_streams_into_draft_events_while_being_written(conv_id, workspace, events):
    doc = "# Worksheet\n\n1. What does Rainsford learn?"
    fake = FakeClient(
        reply(tool("write_file", path="lessons/mdg/worksheet.md", content=doc)),
        reply(text("Done")),
    )
    agent.run_agent(conv_id, "worksheet", client=fake, workspace=workspace)

    drafts = [e for e in events() if e["type"] == "draft"]
    assert drafts and all(d["path"] == "lessons/mdg/worksheet.md" for d in drafts)
    contents = [d["content"] for d in drafts if d["content"]]
    assert doc.startswith(contents[0]) and len(contents[0]) < len(doc)
    assert contents[-1] == doc


def test_progress_notes_stream_as_thinking_events_but_are_not_saved_to_chat(conv_id, workspace, events):
    note = "Checking the lesson plan so the worksheet matches the objective."
    fake = FakeClient(
        reply(thinking(text=note), tool("list_files")),
        reply(text("Done")),
    )
    agent.run_agent(conv_id, "worksheet", client=fake, workspace=workspace)

    notes = [e["text"] for e in events() if e["type"] == "thinking"]
    assert notes[-1] == note
    assert all(note.startswith(n) for n in notes)  # snapshots grow; the UI shows the latest
    assert note not in [r["display_content"] for r in displayed(conv_id)]
    # ...but MARTY still gets its own note back, unchanged, on the next call.
    assert fake.calls[1]["messages"][1]["content"][0] == {"type": "thinking", "thinking": note, "signature": "sig-1"}


def test_interrupted_work_placeholder_is_not_shown(conv_id, workspace, events):
    fake = FakeClient(reply(thinking(text=agent.INTERRUPTED_NOTE), stop_reason="max_tokens"))
    agent.run_agent(conv_id, "big", client=fake, workspace=workspace)
    assert not [e for e in events() if e["type"] == "thinking"]


def test_edits_announce_the_file_without_content(conv_id, workspace, events):
    workspace.write("lessons/a.md", "old line")
    fake = FakeClient(
        reply(tool("edit_file", path="lessons/a.md", old_text="old line", new_text="new line")),
        reply(text("Done")),
    )
    agent.run_agent(conv_id, "edit", client=fake, workspace=workspace)
    drafts = [e for e in events() if e["type"] == "draft"]
    assert drafts and drafts[0] == {"type": "draft", "path": "lessons/a.md", "content": None}
