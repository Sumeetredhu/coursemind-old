from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .config import settings


def _prepare(conn):
    conn.execute("set search_path to public, extensions")
    conn.commit()


pool = ConnectionPool(
    settings.database_url,
    min_size=1,
    max_size=10,
    open=False,
    configure=_prepare,
    kwargs={"row_factory": dict_row, "prepare_threshold": None},
)


def all_rows(sql, params=None):
    with pool.connection() as conn:
        return conn.execute(sql, params).fetchall()


def one_row(sql, params=None):
    with pool.connection() as conn:
        return conn.execute(sql, params).fetchone()


def run(sql, params=None):
    with pool.connection() as conn:
        conn.execute(sql, params)


def vector(values):
    return "[" + ",".join(f"{v:.6f}" for v in values) + "]"
