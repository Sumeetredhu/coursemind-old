from psycopg.types.json import Jsonb
from pydantic import BaseModel

from . import cites, llm, papers
from .db import all_rows, pool, run

PLAN = """Below is every piece of a course's material (slides, notes and lecture transcripts), in order.
Each line is: piece number | source | where | start of the text.

Group the pieces into 4 to 12 study topics, in a sensible order for learning.
Every piece should belong to exactly one topic. Pieces that are just admin stuff
(dates, grading policy, "any questions?") can go with the nearest real topic.
For each topic give a short title, a one line summary and its piece numbers.

{pieces}"""

NOTES = """Make study notes for the topic "{title}" from the course material below.

Rules:
- Use only this material. Don't add facts that aren't in it.
- After every point, put the numbers of the pieces it comes from in `cites`.
- Write like a good student's notes: short, clear points in simple words, not a textbook.
- Group the points into a few sections with helpful headings.
- `terms` are the key words of this topic with a one line meaning.
- Also write 6 to 12 flashcards that test understanding (why, how, compare, apply), not just definitions.
- Write maths as LaTeX between $ signs and code in backticks.

Material:
{material}"""

MAX_PIECES_PER_TOPIC = 80


class TopicPlan(BaseModel):
    title: str
    summary: str
    pieces: list[int]


class Plan(BaseModel):
    topics: list[TopicPlan]


class Point(BaseModel):
    text: str
    cites: list[int]


class Section(BaseModel):
    heading: str
    points: list[Point]


class Term(BaseModel):
    term: str
    meaning: str
    cites: list[int]


class Card(BaseModel):
    front: str
    back: str
    cites: list[int]


class TopicNotes(BaseModel):
    overview: str
    sections: list[Section]
    terms: list[Term]
    flashcards: list[Card]


def build_notes(payload):
    course_id = payload["course_id"]
    run("update courses set notes_status = 'building', notes_error = null where id = %s", (course_id,))

    topics = all_rows("select id, title, chunk_ids, notes from topics where course_id = %s order by position", (course_id,))
    if not topics:
        topics = plan_topics(course_id)

    for topic in topics:
        if topic["notes"] is None:
            write_topic(course_id, topic)

    papers.match_topics(course_id)
    run("update courses set notes_status = 'ready', notes_error = null where id = %s", (course_id,))


def notes_failed(payload, message, final):
    if final:
        run("update courses set notes_status = 'failed', notes_error = %s where id = %s", (message, payload["course_id"]))
    else:
        run("update courses set notes_error = %s where id = %s", (message, payload["course_id"]))


def plan_topics(course_id):
    chunks = cites.course_chunks(course_id)
    if not chunks:
        raise ValueError("Add some slides or videos first")

    preview = 200 if len(chunks) < 600 else 110
    lines = "\n".join(
        f"{i} | {c['title']} | {cites.where(c)} | {' '.join(c['text'][:preview].split())}"
        for i, c in enumerate(chunks, 1)
    )
    plan = llm.ask(PLAN.format(pieces=lines), Plan, smart=True)
    groups = assign(plan, len(chunks))

    topics = []
    with pool.connection() as conn:
        conn.execute("delete from topics where course_id = %s", (course_id,))
        for position, (topic, members) in enumerate(groups):
            chunk_ids = [str(chunks[i - 1]["id"]) for i in members]
            row = conn.execute(
                "insert into topics (course_id, position, title, summary, chunk_ids) "
                "values (%s, %s, %s, %s, %s::uuid[]) returning id, title, chunk_ids, notes",
                (course_id, position, topic.title.strip(), topic.summary.strip(), chunk_ids),
            ).fetchone()
            topics.append(row)
    return topics


def assign(plan, total):
    owner = {}
    for t, topic in enumerate(plan.topics):
        for n in topic.pieces:
            if 1 <= n <= total and n not in owner:
                owner[n] = t

    if not owner:
        raise ValueError("Gemini returned an empty topic list, try again")

    last = min(owner.values())
    for n in range(1, total + 1):
        if n in owner:
            last = owner[n]
        else:
            owner[n] = last

    groups = []
    for t, topic in enumerate(plan.topics):
        members = sorted(n for n, owned_by in owner.items() if owned_by == t)
        if members:
            groups.append((topic, members))
    return groups


def write_topic(course_id, topic):
    chunks = cites.chunks_by_id(topic["chunk_ids"])[:MAX_PIECES_PER_TOPIC]
    if not chunks:
        run("update topics set notes = %s where id = %s", (Jsonb({"overview": "", "sections": [], "terms": []}), topic["id"]))
        return

    result = llm.ask(NOTES.format(title=topic["title"], material=cites.context(chunks)), TopicNotes, smart=True)

    def keep(numbers):
        return cites.ids_for(chunks, numbers)

    notes = {
        "overview": result.overview,
        "sections": [
            {"heading": s.heading, "points": [{"text": p.text, "cites": keep(p.cites)} for p in s.points]}
            for s in result.sections
        ],
        "terms": [{"term": t.term, "meaning": t.meaning, "cites": keep(t.cites)} for t in result.terms],
    }
    cards = [
        (course_id, topic["id"], c.front.strip(), c.back.strip(), keep(c.cites))
        for c in result.flashcards
        if c.front.strip() and c.back.strip()
    ]

    with pool.connection() as conn:
        conn.execute("delete from flashcards where topic_id = %s", (topic["id"],))
        with conn.cursor() as cur:
            cur.executemany(
                "insert into flashcards (course_id, topic_id, front, back, cites) values (%s, %s, %s, %s, %s::uuid[])",
                cards,
            )
        conn.execute("update topics set notes = %s where id = %s", (Jsonb(notes), topic["id"]))
