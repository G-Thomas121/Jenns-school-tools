from app.services.events import Broker


def drain(q):
    out = []
    while not q.empty():
        out.append(q.get_nowait())
    return out


def test_subscribers_receive_events_for_their_conversation_only():
    b = Broker()
    mine, other = b.subscribe(1), b.subscribe(2)
    b.publish(1, {"type": "delta", "text": "hi"})
    assert drain(mine) == [{"type": "delta", "text": "hi"}]
    assert drain(other) == []


def test_every_subscriber_gets_a_copy():
    b = Broker()
    a, c = b.subscribe(1), b.subscribe(1)
    b.publish(1, {"type": "done"})
    assert drain(a) == drain(c) == [{"type": "done"}]


def test_unsubscribed_queue_stops_receiving():
    b = Broker()
    q = b.subscribe(1)
    b.unsubscribe(1, q)
    b.publish(1, {"type": "done"})
    assert drain(q) == []


def test_publish_with_no_subscribers_is_fine():
    Broker().publish(1, {"type": "done"})
