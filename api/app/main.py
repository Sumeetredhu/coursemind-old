import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import jobs, llm
from .config import settings
from .db import pool
from .ingest.pipeline import process_source, source_failed
from .notes import build_notes, notes_failed
from .routes import courses, practice, sources, study

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("coursemind")

jobs.register("process_source", process_source, source_failed)
jobs.register("build_notes", build_notes, notes_failed)


@asynccontextmanager
async def lifespan(app):
    pool.open(wait=True, timeout=30)
    jobs.requeue_stuck()
    stop = jobs.start(settings.workers)
    yield
    stop.set()
    pool.close()


app = FastAPI(title="CourseMind", lifespan=lifespan)


@app.middleware("http")
async def catch_errors(request: Request, call_next):
    try:
        return await call_next(request)
    except llm.OutOfQuota as e:
        return JSONResponse({"detail": str(e)}, status_code=429)
    except Exception as e:
        log.exception("%s %s failed", request.method, request.url.path)
        return JSONResponse({"detail": llm.friendly_error(e)}, status_code=500)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.web_origin.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (courses, sources, study, practice):
    app.include_router(module.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"ok": True}
