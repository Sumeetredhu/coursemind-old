from fastapi import HTTPException
from psycopg.types.json import Jsonb
from pydantic import BaseModel

from . import cites, llm
from .db import one_row, run

QUESTIONS = 5

EXAMINER = """You are a friendly but sharp examiner taking a short viva (oral exam) of a college student.
Use only the numbered course material you are given.
Ask one clear question at a time. Check real understanding: ask why and how, ask for examples,
ask them to compare ideas or apply them. Never give the answer away inside the question.
Keep questions short, like you would say them out loud."""

FIRST = """Course material:
{material}

Start the viva on "{title}". Ask the first question. It should be a warm-up, not too hard.
Leave feedback empty and set score to 0."""

NEXT = """Course material:
{material}

The viva so far:
{transcript}

The student just answered question {number} of {total}.
Give short feedback on that answer: what was right and what was missing or wrong.
When you mention something from the material, cite it like [3].
Score the answer from 0 (no idea) to 5 (excellent).
{after}"""

GO_ON = """Then ask the next question. If they did well, go deeper.
If they struggled, ask an easier question that builds up to the same idea."""

STOP = "This was the last question, so leave next_question empty."

REPORT = """Course material:
{material}

Here is a full viva:
{transcript}

Write a short report for the student. `summary` is 2 or 3 sentences on how it went, speaking to them directly.
`strengths` are things they clearly understand. `revise` are specific things to go back over,
each with the numbers of the material pieces that cover it."""


class Turn(BaseModel):
    feedback: str
    score: int
    next_question: str


class Revise(BaseModel):
    text: str
    cites: list[int]


class Report(BaseModel):
    summary: str
    strengths: list[str]
    revise: list[Revise]


def start(course_id, topic_id):
    topic = one_row("select id, title, chunk_ids from topics where id = %s and course_id = %s", (topic_id, course_id))
    if not topic:
        raise HTTPException(404, "Topic not found")
    chunks = cites.chunks_by_id(topic["chunk_ids"])[:40]
    if not chunks:
        raise HTTPException(400, "This topic has no material")

    turn = llm.ask(FIRST.format(material=cites.context(chunks), title=topic["title"]), Turn, smart=True, quick=True, system=EXAMINER)
    turns = [{"question": turn.next_question.strip()}]
    session = one_row(
        "insert into viva_sessions (course_id, topic_id, chunk_ids, turns) values (%s, %s, %s::uuid[], %s) returning *",
        (course_id, topic["id"], [str(c["id"]) for c in chunks], Jsonb(turns)),
    )
    return view(session, chunks, topic["title"])


def reply(session, answer):
    if session["report"]:
        raise HTTPException(400, "This viva is already finished")
    answer = answer.strip()
    if not answer:
        raise HTTPException(400, "Write an answer first")

    chunks = cites.chunks_by_id(session["chunk_ids"])
    material = cites.context(chunks)
    turns = session["turns"]
    turns[-1]["answer"] = answer
    last = len(turns) >= QUESTIONS

    turn = llm.ask(
        NEXT.format(
            material=material,
            transcript=transcript(turns),
            number=len(turns),
            total=QUESTIONS,
            after=STOP if last else GO_ON,
        ),
        Turn,
        smart=True,
        quick=True,
        system=EXAMINER,
    )
    turns[-1]["feedback"] = turn.feedback.strip()
    turns[-1]["score"] = min(max(turn.score, 0), 5)

    report = None
    if last or not turn.next_question.strip():
        result = llm.ask(REPORT.format(material=material, transcript=transcript(turns)), Report, smart=True)
        report = {
            "score": round(sum(t.get("score", 0) for t in turns) / (5 * len(turns)) * 100),
            "summary": result.summary,
            "strengths": result.strengths,
            "revise": [{"text": r.text, "cites": cites.ids_for(chunks, r.cites)} for r in result.revise],
        }
    else:
        turns.append({"question": turn.next_question.strip()})

    run(
        "update viva_sessions set turns = %s, report = %s where id = %s",
        (Jsonb(turns), Jsonb(report) if report else None, session["id"]),
    )
    session = {**session, "turns": turns, "report": report}
    return view(session, chunks)


def transcript(turns):
    lines = []
    for i, t in enumerate(turns, 1):
        lines.append(f"Q{i}: {t['question']}")
        if "answer" in t:
            lines.append(f"Student: {t['answer']}")
        if "feedback" in t:
            lines.append(f"Feedback (score {t['score']}/5): {t['feedback']}")
    return "\n".join(lines)


def view(session, chunks, title=None):
    if title is None:
        topic = one_row("select title from topics where id = %s", (session["topic_id"],))
        title = topic["title"] if topic else "Viva"
    return {
        "id": session["id"],
        "topic": title,
        "total": QUESTIONS,
        "turns": session["turns"],
        "report": session["report"],
        "sources": [cites.info(c) for c in chunks],
    }
