"""
In-process pub/sub for live chat events. The agent runs in a worker thread and publishes;
each open SSE connection subscribes with its own queue.

Events (all dicts with a "type"):
    message  a chat row was saved: {"message": {id, display_role, display_content, path, created_at}}
    delta    streamed assistant text: {"text": "..."}
    draft    a file is being written: {"path": "...", "content": "partial markdown" | None for edits}
    reset    the in-progress response was discarded (retrying) — drop streamed text/drafts
    done     the run finished

The SSE endpoint also sends one {"type": "status", "running": bool} after replaying saved rows.
"""
import queue
import threading


class Broker:
    def __init__(self):
        self._subs: dict[int, list[queue.Queue]] = {}
        self._lock = threading.Lock()

    def subscribe(self, conversation_id: int) -> queue.Queue:
        q: queue.Queue = queue.Queue()
        with self._lock:
            self._subs.setdefault(conversation_id, []).append(q)
        return q

    def unsubscribe(self, conversation_id: int, q: queue.Queue) -> None:
        with self._lock:
            subs = self._subs.get(conversation_id, [])
            if q in subs:
                subs.remove(q)
            if not subs:
                self._subs.pop(conversation_id, None)

    def publish(self, conversation_id: int, event: dict) -> None:
        with self._lock:
            subs = list(self._subs.get(conversation_id, []))
        for q in subs:
            q.put(event)


broker = Broker()
