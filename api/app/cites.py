from .db import all_rows

CHUNK_FIELDS = """
    c.id, c.source_id, c.text, c.page, c.bbox, c.start_sec, c.end_sec,
    s.title, s.kind, s.video_id
"""


def clock(seconds):
    seconds = int(seconds or 0)
    hours, rest = divmod(seconds, 3600)
    minutes, secs = divmod(rest, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def where(row):
    if row["kind"] == "youtube":
        return f"at {clock(row['start_sec'])}"
    return f"page {row['page']}"


def context(rows):
    return "\n\n".join(
        f'[{i}] From "{row["title"]}", {where(row)}:\n{row["text"]}' for i, row in enumerate(rows, 1)
    )


def ids_for(rows, numbers):
    picked = []
    for n in numbers:
        if 1 <= n <= len(rows):
            chunk_id = str(rows[n - 1]["id"])
            if chunk_id not in picked:
                picked.append(chunk_id)
    return picked


def info(row):
    return {
        "id": str(row["id"]),
        "source_id": str(row["source_id"]),
        "title": row["title"],
        "kind": row["kind"],
        "page": row["page"],
        "bbox": row["bbox"],
        "start": row["start_sec"],
        "end": row["end_sec"],
        "video_id": row["video_id"],
        "label": where(row),
        "snippet": row["text"][:280],
    }


def chunks_by_id(ids):
    ids = list(dict.fromkeys(str(i) for i in ids))
    if not ids:
        return []
    rows = all_rows(
        f"select {CHUNK_FIELDS} from chunks c join sources s on s.id = c.source_id where c.id = any(%s::uuid[])",
        (ids,),
    )
    order = {chunk_id: i for i, chunk_id in enumerate(ids)}
    return sorted(rows, key=lambda row: order[str(row["id"])])


def course_chunks(course_id, limit=None, shuffle=False):
    order = "random()" if shuffle else "s.created_at, c.position"
    sql = (
        f"select {CHUNK_FIELDS} from chunks c join sources s on s.id = c.source_id "
        f"where c.course_id = %s and s.role = 'material' order by {order}"
    )
    if limit:
        sql += f" limit {int(limit)}"
    return all_rows(sql, (course_id,))


def details(ids):
    return {str(row["id"]): info(row) for row in chunks_by_id(ids)}
