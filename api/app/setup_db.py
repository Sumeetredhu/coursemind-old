from pathlib import Path

import psycopg

from . import storage
from .config import settings


def main():
    schema = (Path(__file__).parent / "schema.sql").read_text()
    with psycopg.connect(settings.database_url, prepare_threshold=None) as conn:
        conn.execute("set search_path to public, extensions")
        conn.execute(schema)
    print("Tables are ready")
    storage.ensure_bucket()
    print(f"Storage bucket '{settings.bucket}' is ready")


if __name__ == "__main__":
    main()
