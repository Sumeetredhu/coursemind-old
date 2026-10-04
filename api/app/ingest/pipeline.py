from google.genai import types
from pydantic import BaseModel

from .. import llm, papers, storage
from ..db import one_row, pool, run, vector
from . import Piece, pdf, youtube

TRANSCRIBE = """Transcribe this lecture video.
Split it into segments of roughly 30 to 60 seconds. For each segment give the start time in seconds
and everything that was said. Keep the original language. If the slides or board show important text
that isn't spoken out loud, add it in square brackets."""

READ_PAGES = """These are scanned pages from a PDF, pages {pages}, in that order.
Write out all the readable text on each page, including handwriting. Write equations as LaTeX
and keep table contents. Return one entry per page with its page number."""

INSERT_CHUNK = """
insert into chunks (source_id, course_id, position, text, page, bbox, start_sec, end_sec, embedding)
values (%s, %s, %s, %s, %s, %s, %s, %s, %s::vector)
"""


class Segment(BaseModel):
    start_sec: int
    text: str


class Transcript(BaseModel):
    segments: list[Segment]


class PageText(BaseModel):
    page: int
    text: str


class Pages(BaseModel):
    pages: list[PageText]


def process_source(payload):
    source = one_row("select * from sources where id = %s", (payload["source_id"],))
    if not source:
        return
    run("update sources set status = 'processing', error = null where id = %s", (source["id"],))

    if source["role"] == "paper":
        papers.read_paper(source, storage.download(source["file_path"]))
        run("update sources set status = 'ready' where id = %s", (source["id"],))
        return

    if source["kind"] == "youtube":
        pieces, length = load_video(source)
        size_column, size = "duration_sec", length
    else:
        pieces, pages = load_pdf(storage.download(source["file_path"]))
        size_column, size = "page_count", pages

    if not pieces:
        raise ValueError("Couldn't find any text in this source")

    vectors = llm.embed([p.text for p in pieces], title=source["title"])
    rows = [
        (source["id"], source["course_id"], i, p.text, p.page, p.bbox, p.start, p.end, vector(v))
        for i, (p, v) in enumerate(zip(pieces, vectors))
    ]
    with pool.connection() as conn:
        conn.execute("delete from chunks where source_id = %s", (source["id"],))
        with conn.cursor() as cur:
            cur.executemany(INSERT_CHUNK, rows)
        conn.execute(
            f"update sources set status = 'ready', error = null, {size_column} = %s where id = %s",
            (size, source["id"]),
        )


def source_failed(payload, message, final):
    status = "failed" if final else "queued"
    run("update sources set status = %s, error = %s where id = %s", (status, message, payload["source_id"]))


def load_video(source):
    lines = youtube.transcript(source["video_id"]) or transcribe(source["url"])
    if not lines:
        raise ValueError("Couldn't get any speech out of this video")
    last_start, last_length, _ = lines[-1]
    return youtube.group(lines), int(last_start + last_length)


def transcribe(url):
    video = types.Part(file_data=types.FileData(file_uri=url))
    result = llm.ask(TRANSCRIBE, Transcript, files=[video], low_res=True)
    segments = sorted(result.segments, key=lambda s: s.start_sec)
    lines = []
    for i, seg in enumerate(segments):
        end = segments[i + 1].start_sec if i + 1 < len(segments) else seg.start_sec + 30
        lines.append((float(seg.start_sec), float(max(1, end - seg.start_sec)), seg.text))
    return lines


def load_pdf(data):
    pieces, scanned, pages = pdf.read(data)
    for i in range(0, len(scanned), 4):
        pieces.extend(read_scanned(scanned[i : i + 4]))
    pieces.sort(key=lambda p: (p.page, p.bbox[1] if p.bbox else 0))
    return pieces, pages


def read_scanned(batch):
    numbers = [n for n, _ in batch]
    images = [types.Part.from_bytes(data=png, mime_type="image/png") for _, png in batch]
    result = llm.ask(READ_PAGES.format(pages=", ".join(map(str, numbers))), Pages, files=images)
    pieces = []
    for page in result.pages:
        text = " ".join(page.text.split())
        if text and page.page in numbers:
            pieces.append(Piece(text=text, page=page.page))
    return pieces
