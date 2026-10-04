import time

import httpx
from fastapi import Header, HTTPException

from .config import settings
from .db import one_row

_known: dict[str, tuple[str, float]] = {}


def user_id(authorization: str = Header(default="")) -> str:
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(401, "Please sign in")

    cached = _known.get(token)
    if cached and cached[1] > time.time():
        return cached[0]

    res = httpx.get(
        f"{settings.supabase_url}/auth/v1/user",
        headers={"apikey": settings.supabase_publishable_key, "Authorization": f"Bearer {token}"},
        timeout=10,
    )
    if res.status_code != 200:
        raise HTTPException(401, "Your session expired, please sign in again")

    if len(_known) > 2000:
        _known.clear()
    uid = res.json()["id"]
    _known[token] = (uid, time.time() + 300)
    return uid


def course_for(course_id, uid) -> dict:
    course = one_row("select * from courses where id = %s and owner_id = %s", (course_id, uid))
    if not course:
        raise HTTPException(404, "Course not found")
    return course
