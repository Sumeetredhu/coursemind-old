import logging
import threading
import time

from psycopg.types.json import Jsonb

from .db import pool
from .llm import OutOfQuota, friendly_error

log = logging.getLogger("coursemind.jobs")

MAX_ATTEMPTS = 4
HEARTBEAT_SECONDS = 30

CLAIM = """
update jobs
set status = 'running', locked_at = now(), attempts = attempts + 1
where id = (
    select id from jobs
    where status = 'queued' and run_after <= now()
    order by id
    for update skip locked
    limit 1
)
returning *
"""

_handlers = {}


def register(kind, run, on_fail=None):
    _handlers[kind] = (run, on_fail)


def enqueue(conn, kind, payload):
    conn.execute("insert into jobs (kind, payload) values (%s, %s)", (kind, Jsonb(payload)))


def requeue_stuck():
    with pool.connection() as conn:
        conn.execute(
            "update jobs set status = 'queued', locked_at = null, attempts = greatest(attempts - 1, 0) "
            "where status = 'running' and locked_at < now() - interval '2 minutes'"
        )


def _heartbeat(job_id, done):
    while not done.wait(HEARTBEAT_SECONDS):
        try:
            with pool.connection() as conn:
                conn.execute("update jobs set locked_at = now() where id = %s and status = 'running'", (job_id,))
        except Exception:
            log.exception("heartbeat for job %s failed", job_id)


def _claim():
    with pool.connection() as conn:
        return conn.execute(CLAIM).fetchone()


def _finish(job):
    with pool.connection() as conn:
        conn.execute("update jobs set status = 'done', locked_at = null, error = null where id = %s", (job["id"],))


def _fail(job, message):
    final = job["attempts"] >= MAX_ATTEMPTS
    with pool.connection() as conn:
        if final:
            conn.execute(
                "update jobs set status = 'failed', locked_at = null, error = %s where id = %s",
                (message, job["id"]),
            )
        else:
            message = f"{message} Retrying soon."
            conn.execute(
                "update jobs set status = 'queued', locked_at = null, error = %s, "
                "run_after = now() + %s * interval '1 minute' where id = %s",
                (message, 2 * job["attempts"], job["id"]),
            )
    _tell(job, message, final)


def _postpone(job, e):
    with pool.connection() as conn:
        conn.execute(
            "update jobs set status = 'queued', locked_at = null, attempts = attempts - 1, error = %s, "
            "run_after = now() + %s * interval '1 second' where id = %s",
            (str(e), int(e.wait) + 30, job["id"]),
        )
    _tell(job, str(e), False)


def _tell(job, message, final):
    on_fail = _handlers.get(job["kind"], (None, None))[1]
    if on_fail:
        on_fail(job["payload"], message, final)


def _work(stop):
    last_sweep = 0.0
    while not stop.is_set():
        try:
            if time.monotonic() - last_sweep > 60:
                requeue_stuck()
                last_sweep = time.monotonic()
            job = _claim()
        except Exception:
            log.exception("couldn't read the job queue")
            stop.wait(10)
            continue

        if not job:
            stop.wait(2)
            continue

        done = threading.Event()
        threading.Thread(target=_heartbeat, args=(job["id"], done), daemon=True).start()
        try:
            run = _handlers[job["kind"]][0]
            run(job["payload"])
            _finish(job)
        except OutOfQuota as e:
            log.info("job %s waiting %ss for Gemini's limit to reset", job["id"], int(e.wait))
            _postpone(job, e)
        except Exception as e:
            log.warning("job %s (%s) failed: %s", job["id"], job["kind"], e)
            try:
                _fail(job, friendly_error(e))
            except Exception:
                log.exception("couldn't mark job %s as failed", job["id"])
        finally:
            done.set()


def start(count):
    stop = threading.Event()
    for i in range(count):
        threading.Thread(target=_work, args=(stop,), name=f"worker-{i}", daemon=True).start()
    return stop
