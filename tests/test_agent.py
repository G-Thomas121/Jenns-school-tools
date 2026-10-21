"""
The agent loop, driven by a scripted fake Anthropic client so no real API calls happen.
"""
import copy
import subprocess

import pytest
from anthropic.types.beta import BetaMessage

from app.database import get_db
from app.services import agent


class FakeClient:
    """Returns scripted responses in order and records every request it receives."""

    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls = []
        self.beta = self
        self.messages = self

    def create(self, **kwargs):
        self.calls.append(copy.deepcopy(kwargs))
        return self.responses.pop(0)


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


def thinking(sig="sig-1"):
    return {"type": "thinking", "thinking": "", "signature": sig}


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
    assert call["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert {t["name"] for t in call["tools"]} == {
        "list_files", "read_file", "write_file", "edit_file", "search_files", "remember",
    }


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
