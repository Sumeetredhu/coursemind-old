from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from .. import storage
from ..auth import course_for, user_id
from ..db import all_rows, one_row, run

router = APIRouter()


class NewCourse(BaseModel):
    name: str


@router.get("/courses")
def list_courses(uid: str = Depends(user_id)):
    return all_rows(
        """
        select c.id, c.name, c.created_at, c.notes_status,
               count(s.id) as sources,
               count(s.id) filter (where s.status = 'ready') as ready
        from courses c
        left join sources s on s.course_id = c.id
        where c.owner_id = %s
        group by c.id
        order by c.created_at desc
        """,
        (uid,),
    )


@router.post("/courses")
def create_course(body: NewCourse, uid: str = Depends(user_id)):
    name = body.name.strip()[:120] or "Untitled course"
    return one_row("insert into courses (owner_id, name) values (%s, %s) returning id, name", (uid, name))


@router.get("/courses/{course_id}")
def get_course(course_id: UUID, uid: str = Depends(user_id)):
    course = course_for(course_id, uid)
    sources = all_rows(
        "select id, kind, role, title, url, video_id, year, page_count, duration_sec, status, error, created_at "
        "from sources where course_id = %s order by created_at",
        (course_id,),
    )
    topics = all_rows(
        "select id, title, summary, position, notes is not null as has_notes "
        "from topics where course_id = %s order by position",
        (course_id,),
    )
    return {
        "id": course["id"],
        "name": course["name"],
        "notes_status": course["notes_status"],
        "notes_error": course["notes_error"],
        "sources": sources,
        "topics": topics,
    }


@router.delete("/courses/{course_id}")
def delete_course(course_id: UUID, uid: str = Depends(user_id)):
    course_for(course_id, uid)
    files = [r["file_path"] for r in all_rows(
        "select file_path from sources where course_id = %s and file_path is not null", (course_id,)
    )]
    run("delete from courses where id = %s", (course_id,))
    storage.remove(files)
    return {"ok": True}
