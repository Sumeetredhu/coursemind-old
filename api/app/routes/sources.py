import hashlib
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel

from .. import jobs, storage
from ..auth import course_for, user_id
from ..config import settings
from ..db import one_row, pool, run
from ..ingest import youtube

router = APIRouter()


class NewVideo(BaseModel):
    url: str


def source_for(source_id, uid):
    source = one_row(
        "select s.* from sources s join courses c on c.id = s.course_id where s.id = %s and c.owner_id = %s",
        (source_id, uid),
    )
    if not source:
        raise HTTPException(404, "Source not found")
    return source


@router.post("/courses/{course_id}/youtube")
def add_video(course_id: UUID, body: NewVideo, uid: str = Depends(user_id)):
    course_for(course_id, uid)
    vid = youtube.video_id(body.url)
    if not vid:
        raise HTTPException(400, "That doesn't look like a YouTube link")
    if one_row("select 1 from sources where course_id = %s and video_id = %s", (course_id, vid)):
        raise HTTPException(409, "This video is already in the course")

    url = f"https://www.youtube.com/watch?v={vid}"
    title = youtube.video_title(url)
    with pool.connection() as conn:
        source = conn.execute(
            "insert into sources (course_id, kind, title, url, video_id) values (%s, 'youtube', %s, %s, %s) "
            "returning id, title, status",
            (course_id, title, url, vid),
        ).fetchone()
        jobs.enqueue(conn, "process_source", {"source_id": str(source["id"])})
    return source


@router.post("/courses/{course_id}/pdf")
def add_pdf(
    course_id: UUID,
    file: UploadFile,
    role: str = Form("material"),
    year: int | None = Form(None),
    uid: str = Depends(user_id),
):
    course_for(course_id, uid)
    limit = settings.max_upload_mb * 1024 * 1024
    data = file.file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(413, f"Keep PDFs under {settings.max_upload_mb} MB")
    if not data.startswith(b"%PDF"):
        raise HTTPException(400, "Please upload a PDF file")

    digest = hashlib.sha256(data).hexdigest()
    if one_row("select 1 from sources where course_id = %s and content_hash = %s", (course_id, digest)):
        raise HTTPException(409, "You already uploaded this file")

    role = "paper" if role == "paper" else "material"
    title = Path(file.filename or "document.pdf").stem[:150]
    source_id = uuid4()
    path = f"{course_id}/{source_id}.pdf"
    storage.upload(path, data)

    with pool.connection() as conn:
        source = conn.execute(
            "insert into sources (id, course_id, kind, role, title, file_path, content_hash, year) "
            "values (%s, %s, 'pdf', %s, %s, %s, %s, %s) returning id, title, status",
            (source_id, course_id, role, title, path, digest, year),
        ).fetchone()
        jobs.enqueue(conn, "process_source", {"source_id": str(source_id)})
    return source


@router.get("/sources/{source_id}/file")
def source_file(source_id: UUID, uid: str = Depends(user_id)):
    source = source_for(source_id, uid)
    if not source["file_path"]:
        raise HTTPException(404, "This source has no file")
    return Response(
        storage.download(source["file_path"]),
        media_type="application/pdf",
        headers={"Cache-Control": "private, max-age=3600"},
    )


@router.post("/sources/{source_id}/retry")
def retry_source(source_id: UUID, uid: str = Depends(user_id)):
    source = source_for(source_id, uid)
    with pool.connection() as conn:
        conn.execute("update sources set status = 'queued', error = null where id = %s", (source["id"],))
        jobs.enqueue(conn, "process_source", {"source_id": str(source["id"])})
    return {"ok": True}


@router.delete("/sources/{source_id}")
def delete_source(source_id: UUID, uid: str = Depends(user_id)):
    source = source_for(source_id, uid)
    run("delete from sources where id = %s", (source["id"],))
    if source["file_path"]:
        storage.remove([source["file_path"]])
    return {"ok": True}
