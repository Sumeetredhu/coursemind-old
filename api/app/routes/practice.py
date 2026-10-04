from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import cites, papers, quiz, viva
from ..auth import course_for, user_id
from ..db import one_row

router = APIRouter()


class NewQuiz(BaseModel):
    topic_id: UUID | None = None
    count: int = Field(default=8, ge=3, le=15)


class Answers(BaseModel):
    answers: list[str]


class NewViva(BaseModel):
    topic_id: UUID


class VivaAnswer(BaseModel):
    answer: str


@router.get("/courses/{course_id}/papers")
def past_papers(course_id: UUID, uid: str = Depends(user_id)):
    course_for(course_id, uid)
    return papers.overview(course_id)


@router.post("/courses/{course_id}/quizzes")
def new_quiz(course_id: UUID, body: NewQuiz, uid: str = Depends(user_id)):
    course_for(course_id, uid)
    return quiz.make(course_id, body.topic_id, body.count)


@router.post("/quizzes/{quiz_id}/submit")
def submit_quiz(quiz_id: UUID, body: Answers, uid: str = Depends(user_id)):
    row = one_row(
        "select q.* from quizzes q join courses c on c.id = q.course_id where q.id = %s and c.owner_id = %s",
        (quiz_id, uid),
    )
    if not row:
        raise HTTPException(404, "Quiz not found")
    return quiz.grade(row, body.answers)


@router.post("/courses/{course_id}/viva")
def new_viva(course_id: UUID, body: NewViva, uid: str = Depends(user_id)):
    course_for(course_id, uid)
    return viva.start(course_id, body.topic_id)


@router.post("/viva/{session_id}/answer")
def answer_viva(session_id: UUID, body: VivaAnswer, uid: str = Depends(user_id)):
    return viva.reply(session_for(session_id, uid), body.answer)


@router.get("/viva/{session_id}")
def get_viva(session_id: UUID, uid: str = Depends(user_id)):
    session = session_for(session_id, uid)
    return viva.view(session, cites.chunks_by_id(session["chunk_ids"]))


def session_for(session_id, uid):
    session = one_row(
        "select v.* from viva_sessions v join courses c on c.id = v.course_id where v.id = %s and c.owner_id = %s",
        (session_id, uid),
    )
    if not session:
        raise HTTPException(404, "Viva not found")
    return session
