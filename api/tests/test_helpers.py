from app.cites import clock, context, ids_for
from app.notes import Plan, TopicPlan, assign
from app.quiz import match_option


def test_clock():
    assert clock(5) == "0:05"
    assert clock(754) == "12:34"
    assert clock(3725) == "1:02:05"


def test_context_labels_each_piece():
    rows = [
        {"id": "a", "title": "Lecture 1", "kind": "pdf", "page": 4, "start_sec": None, "text": "Paging"},
        {"id": "b", "title": "OS video", "kind": "youtube", "page": None, "start_sec": 754, "text": "TLB"},
    ]
    text = context(rows)
    assert '[1] From "Lecture 1", page 4:\nPaging' in text
    assert '[2] From "OS video", at 12:34:\nTLB' in text


def test_ids_for_ignores_bad_numbers():
    rows = [{"id": "a"}, {"id": "b"}, {"id": "c"}]
    assert ids_for(rows, [2, 9, 0, 2, 1]) == ["b", "a"]


def test_assign_covers_every_piece():
    plan = Plan(
        topics=[
            TopicPlan(title="Intro", summary="", pieces=[1, 2]),
            TopicPlan(title="Paging", summary="", pieces=[4, 5, 99]),
            TopicPlan(title="Empty", summary="", pieces=[]),
        ]
    )
    groups = assign(plan, 6)
    assert [t.title for t, _ in groups] == ["Intro", "Paging"]
    assert groups[0][1] == [1, 2, 3]
    assert groups[1][1] == [4, 5, 6]


def test_match_option():
    options = ["A stack", "A queue", "A heap", "A tree"]
    assert match_option("A queue", options) == "A queue"
    assert match_option("b) a queue", options) == "A queue"
    assert match_option("C", options) == "A heap"
    assert match_option("something else", options) is None
