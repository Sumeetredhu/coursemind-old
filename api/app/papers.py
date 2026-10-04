from google.genai import types
from pydantic import BaseModel

from . import llm
from .db import all_rows, pool
from .ingest.pdf import page_count

READ = """This is a past exam paper. List every question in it.
Keep sub-parts (like 2a and 2b) as separate questions with their own number.
Copy each question faithfully and write maths as LaTeX between $ signs.
Give marks as a number (0 if the paper doesn't show them) and the page the question is on.
For year, give the exam year if the paper shows it, otherwise 0."""

MATCH = """Here are the topics of a course and some questions from its past exam papers.
For every question, pick the topic it mostly tests. Use 0 if no topic fits.

Topics:
{topics}

Questions:
{questions}"""


class Question(BaseModel):
    number: str
    text: str
    marks: float
    page: int


class Paper(BaseModel):
    year: int
    questions: list[Question]


class Match(BaseModel):
    question: int
    topic: int


class Matches(BaseModel):
    matches: list[Match]


def read_paper(source, data):
    if len(data) > 18 * 1024 * 1024:
        raise ValueError("This PDF is too big for a past paper, keep it under 18 MB")

    pdf = types.Part.from_bytes(data=data, mime_type="application/pdf")
    paper = llm.ask(READ, Paper, files=[pdf])
    year = source["year"] or paper.year or None
    rows = [
        (source["course_id"], source["id"], year, q.number.strip(), q.text.strip(), q.marks or None, q.page or None)
        for q in paper.questions
        if q.text.strip()
    ]
    if not rows:
        raise ValueError("Couldn't find any questions in this paper")

    with pool.connection() as conn:
        conn.execute("delete from paper_questions where source_id = %s", (source["id"],))
        with conn.cursor() as cur:
            cur.executemany(
                "insert into paper_questions (course_id, source_id, year, number, text, marks, page) "
                "values (%s, %s, %s, %s, %s, %s, %s)",
                rows,
            )
        conn.execute(
            "update sources set year = %s, page_count = %s where id = %s",
            (year, page_count(data), source["id"]),
        )
    match_topics(source["course_id"])


def match_topics(course_id):
    topics = all_rows("select id, title, summary from topics where course_id = %s order by position", (course_id,))
    questions = all_rows("select id, text from paper_questions where course_id = %s", (course_id,))
    if not topics or not questions:
        return

    topic_list = "\n".join(f"{i}. {t['title']}: {t['summary']}" for i, t in enumerate(topics, 1))
    for start in range(0, len(questions), 60):
        batch = questions[start : start + 60]
        question_list = "\n".join(f"{i}. {q['text'][:500]}" for i, q in enumerate(batch, 1))
        result = llm.ask(MATCH.format(topics=topic_list, questions=question_list), Matches)
        picked = {}
        for m in result.matches:
            if 1 <= m.question <= len(batch):
                picked[batch[m.question - 1]["id"]] = topics[m.topic - 1]["id"] if 1 <= m.topic <= len(topics) else None
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.executemany(
                    "update paper_questions set topic_id = %s where id = %s",
                    [(topic_id, question_id) for question_id, topic_id in picked.items()],
                )


def overview(course_id):
    papers = all_rows(
        "select id, title, year, status, error, page_count from sources "
        "where course_id = %s and role = 'paper' order by year desc nulls last, created_at",
        (course_id,),
    )
    topics = all_rows(
        """
        select t.id, t.title, t.position,
               count(q.id) as questions,
               count(distinct q.year) as years,
               coalesce(sum(q.marks), 0) as marks
        from topics t
        left join paper_questions q on q.topic_id = t.id
        where t.course_id = %s
        group by t.id
        order by years desc, questions desc, marks desc, t.position
        """,
        (course_id,),
    )
    questions = all_rows(
        "select q.id, q.topic_id, q.source_id, q.year, q.number, q.text, q.marks, q.page, s.title as paper "
        "from paper_questions q join sources s on s.id = q.source_id "
        "where q.course_id = %s order by q.year desc nulls last, s.created_at, q.page, q.number",
        (course_id,),
    )
    years = sorted({q["year"] for q in questions if q["year"]}, reverse=True)
    return {"papers": papers, "topics": topics, "questions": questions, "years": years}


def examples(course_id, topic_id=None, limit=6):
    if topic_id:
        rows = all_rows(
            "select text, marks from paper_questions where course_id = %s "
            "order by (topic_id = %s) desc nulls last, random() limit %s",
            (course_id, topic_id, limit),
        )
    else:
        rows = all_rows(
            "select text, marks from paper_questions where course_id = %s order by random() limit %s",
            (course_id, limit),
        )
    return rows
