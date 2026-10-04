import re

from fastapi import HTTPException
from psycopg.types.json import Jsonb
from pydantic import BaseModel

from . import cites, llm, papers
from .db import one_row

WRITE = """Write {count} practice questions for a college exam from the course material below.

- About 60% multiple choice with 4 options and exactly one right option.
  For these, `answer` must be the exact text of the right option.
- The rest short answer: leave `options` empty and put a model answer of 1 to 4 sentences in `answer`.
- Test understanding, not memory of small details.
- `explanation` says why the answer is right in 1 or 2 sentences.
- Put the numbers of the pieces each question comes from in `cites`.
- Use only this material. Write maths as LaTeX between $ signs.
{style}
Material:
{material}"""

STYLE = """
Match the style and difficulty of these real past exam questions from this course:
{examples}
"""

MARK = """Mark these short answers from a student. For each one give a score of 0, 0.5 or 1
and one or two sentences of feedback saying what was good and what was missing.
Accept answers that are right but worded differently. Be fair, not harsh.

{items}"""


class Draft(BaseModel):
    question: str
    options: list[str]
    answer: str
    explanation: str
    cites: list[int]


class Drafts(BaseModel):
    questions: list[Draft]


class Grade(BaseModel):
    number: int
    score: float
    feedback: str


class Grades(BaseModel):
    grades: list[Grade]


def material(course_id, topic_id):
    if topic_id:
        topic = one_row("select chunk_ids from topics where id = %s and course_id = %s", (topic_id, course_id))
        if not topic:
            raise HTTPException(404, "Topic not found")
        return cites.chunks_by_id(topic["chunk_ids"])[:40]
    return cites.course_chunks(course_id, limit=40, shuffle=True)


def make(course_id, topic_id, count):
    chunks = material(course_id, topic_id)
    if not chunks:
        raise HTTPException(400, "There's no material for this yet")

    past = papers.examples(course_id, topic_id)
    style = STYLE.format(examples="\n".join(f"- {q['text'][:400]}" for q in past)) if past else ""
    drafts = llm.ask(
        WRITE.format(count=count, style=style, material=cites.context(chunks)),
        Drafts,
        smart=True,
    )

    questions = []
    for d in drafts.questions[:count]:
        options = [o.strip() for o in d.options if o.strip()]
        answer = d.answer.strip()
        if len(options) >= 2:
            answer = match_option(answer, options)
            if answer is None:
                continue
        questions.append(
            {
                "kind": "mcq" if len(options) >= 2 else "short",
                "question": d.question.strip(),
                "options": options if len(options) >= 2 else [],
                "answer": answer,
                "explanation": d.explanation.strip(),
                "cites": cites.ids_for(chunks, d.cites),
            }
        )
    if not questions:
        raise HTTPException(502, "Gemini didn't write usable questions, try again")

    row = one_row(
        "insert into quizzes (course_id, topic_id, questions) values (%s, %s, %s) returning id",
        (course_id, topic_id, Jsonb(questions)),
    )
    return {"id": row["id"], "questions": [public(q) for q in questions]}


def match_option(answer, options):
    if answer in options:
        return answer

    def plain(text):
        return re.sub(r"^\(?[a-d][\).:]\s*", "", text.strip(), flags=re.IGNORECASE).lower()

    for option in options:
        if plain(option) == plain(answer):
            return option
    if len(answer) == 1 and answer.lower() in "abcd":
        index = "abcd".index(answer.lower())
        if index < len(options):
            return options[index]
    return None


def public(question):
    return {"kind": question["kind"], "question": question["question"], "options": question["options"]}


def grade(quiz, answers):
    questions = quiz["questions"]
    answers = [(answers[i] if i < len(answers) else "").strip() for i in range(len(questions))]
    results = [None] * len(questions)
    to_mark = []

    for i, (q, given) in enumerate(zip(questions, answers)):
        if q["kind"] == "mcq":
            right = given == q["answer"]
            results[i] = {"score": 1.0 if right else 0.0, "feedback": "Correct!" if right else "Not quite."}
        elif not given:
            results[i] = {"score": 0.0, "feedback": "No answer given."}
        else:
            to_mark.append(i)

    if to_mark:
        items = "\n\n".join(
            f"{n}. Question: {questions[i]['question']}\nModel answer: {questions[i]['answer']}\nStudent answer: {answers[i]}"
            for n, i in enumerate(to_mark, 1)
        )
        marked = {g.number: g for g in llm.ask(MARK.format(items=items), Grades).grades}
        for n, i in enumerate(to_mark, 1):
            g = marked.get(n)
            score = min(max(g.score, 0.0), 1.0) if g else 0.0
            results[i] = {"score": score, "feedback": g.feedback if g else "Couldn't mark this one."}

    for q, given, result in zip(questions, answers, results):
        result.update(answer=q["answer"], explanation=q["explanation"], cites=q["cites"], given=given)

    score = round(100 * sum(r["score"] for r in results) / len(results), 1)
    one_row(
        "insert into quiz_attempts (quiz_id, answers, results, score) values (%s, %s, %s, %s) returning id",
        (quiz["id"], Jsonb(answers), Jsonb(results), score),
    )
    ids = [chunk_id for r in results for chunk_id in r["cites"]]
    return {"score": score, "results": results, "citations": cites.details(ids)}
