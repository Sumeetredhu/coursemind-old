from . import llm
from .cites import CHUNK_FIELDS
from .db import all_rows, vector

SQL = f"""
with by_meaning as (
    select id, row_number() over (order by embedding <=> %(vec)s::vector) as rank
    from chunks
    where course_id = %(course)s and embedding is not null
    order by embedding <=> %(vec)s::vector
    limit 40
),
by_words as (
    select id, row_number() over (order by ts_rank_cd(tsv, q) desc) as rank
    from chunks, websearch_to_tsquery('english', %(text)s) q
    where course_id = %(course)s and tsv @@ q
    order by ts_rank_cd(tsv, q) desc
    limit 40
),
hits as (
    select id from by_meaning
    union
    select id from by_words
)
select {CHUNK_FIELDS},
       coalesce(1.0 / (60 + m.rank), 0) + coalesce(1.0 / (60 + w.rank), 0) as score
from hits
join chunks c on c.id = hits.id
join sources s on s.id = c.source_id
left join by_meaning m on m.id = c.id
left join by_words w on w.id = c.id
order by score desc
limit %(limit)s
"""


def search(course_id, text, limit=8):
    vec = vector(llm.embed([text], query=True)[0])
    return all_rows(SQL, {"vec": vec, "course": str(course_id), "text": text, "limit": limit})
