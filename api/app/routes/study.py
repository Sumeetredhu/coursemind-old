import json
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .. import cites, jobs, llm, srs
from ..auth import course_for, user_id
from ..db import all_rows, one_row, pool, run
from ..search import search

router = APIRouter()

ANSWER = """You help a college student study their own course material.
Answer only from the numbered sources. After each sentence or bullet that uses a source,
add its number in square brackets like [2]. If the sources don't cover the question,
say that plainly instead of guessing. Keep it short and clear, use markdown,
and write maths as LaTeX between $ signs."""


class Message(BaseModel):
    role: str
    text: str


class Question(BaseModel):
    question: str
    history: list[Message] = []


class Review(BaseModel):
    grade: str


@router.post("/courses/{course_id}/notes")
def build_notes(course_id: UUID, uid: str = Depends(user_id)):
    course = course_for(course_id, uid)
    if course["notes_status"] in ("queued", "building"):
        raise HTTPException(409, "Notes are already being made")
    if not one_row("select 1 from chunks where course_id = %s limit 1", (course_id,)):
        raise HTTPException(400, "Add a video or PDF first and wait for it to finish processing")

    with pool.connection() as conn:
        if course["notes_status"] != "failed":
            conn.execute("delete from topics where course_id = %s", (course_id,))
        conn.execute("update courses set notes_status = 'queued', notes_error = null where id = %s", (course_id,))
        jobs.enqueue(conn, "build_notes", {"course_id": str(course_id)})
    return {"ok": True}


@router.get("/courses/{course_id}/notes")
def get_notes(course_id: UUID, uid: str = Depends(user_id)):
    course = course_for(course_id, uid)
    topics = all_rows(
        "select id, title, summary, position, notes from topics where course_id = %s order by position",
        (course_id,),
    )
    ids = []
    for topic in topics:
        notes = topic["notes"] or {}
        for section in notes.get("sections", []):
            for point in section["points"]:
                ids.extend(point["cites"])
        for term in notes.get("terms", []):
            ids.extend(term["cites"])
    return {
        "status": course["notes_status"],
        "error": course["notes_error"],
        "topics": topics,
        "citations": cites.details(ids),
    }


@router.get("/courses/{course_id}/flashcards")
def get_flashcards(course_id: UUID, due: bool = False, topic_id: UUID | None = None, uid: str = Depends(user_id)):
    course_for(course_id, uid)
    sql = (
        "select f.id, f.front, f.back, f.cites, f.due_at, f.reps, f.topic_id, t.title as topic "
        "from flashcards f left join topics t on t.id = f.topic_id where f.course_id = %s"
    )
    params = [course_id]
    if topic_id:
        sql += " and f.topic_id = %s"
        params.append(topic_id)
    if due:
        sql += " and f.due_at <= now()"
    sql += " order by f.due_at, t.position limit 300"
    cards = all_rows(sql, params)

    counts = one_row(
        "select count(*) as total, count(*) filter (where due_at <= now()) as due from flashcards where course_id = %s",
        (course_id,),
    )
    ids = [chunk_id for card in cards for chunk_id in card["cites"]]
    return {"cards": cards, "total": counts["total"], "due": counts["due"], "citations": cites.details(ids)}


@router.post("/flashcards/{card_id}/review")
def review_card(card_id: UUID, body: Review, uid: str = Depends(user_id)):
    if body.grade not in srs.GRADES:
        raise HTTPException(400, "Grade must be again, hard, good or easy")
    card = one_row(
        "select f.* from flashcards f join courses c on c.id = f.course_id where f.id = %s and c.owner_id = %s",
        (card_id, uid),
    )
    if not card:
        raise HTTPException(404, "Card not found")

    new = srs.review(card, body.grade, datetime.now(timezone.utc))
    run(
        "update flashcards set ease = %s, interval_days = %s, reps = %s, lapses = %s, due_at = %s where id = %s",
        (new["ease"], new["interval_days"], new["reps"], new["lapses"], new["due_at"], card_id),
    )
    return {"due_at": new["due_at"], "interval_days": new["interval_days"]}


@router.post("/courses/{course_id}/ask")
def ask(course_id: UUID, body: Question, uid: str = Depends(user_id)):
    course_for(course_id, uid)
    question = body.question.strip()
    if not question:
        raise HTTPException(400, "Type a question first")

    hits = search(course_id, question)
    sources = [cites.info(h) for h in hits]
    earlier = "\n".join(
        f"{'Student' if m.role == 'user' else 'You'}: {m.text[:1500]}" for m in body.history[-6:]
    )
    prompt = f"Sources:\n{cites.context(hits)}\n\n"
    if earlier:
        prompt += f"Conversation so far:\n{earlier}\n\n"
    prompt += f"Student's question: {question}"

    def events():
        yield event("sources", sources)
        if not hits:
            yield event("text", {"text": "I couldn't find anything about this in your material yet."})
        else:
            try:
                for text in llm.stream(prompt, system=ANSWER):
                    yield event("text", {"text": text})
            except Exception as e:
                yield event("error", {"message": llm.friendly_error(e)})
        yield event("done", {})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def event(name, data):
    return f"event: {name}\ndata: {json.dumps(data, default=str)}\n\n"
