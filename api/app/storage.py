import httpx

from .config import settings

BASE = f"{settings.supabase_url}/storage/v1"


def _headers(extra=None):
    key = settings.supabase_secret_key
    headers = {"apikey": key}
    if key.startswith("eyJ"):
        headers["Authorization"] = f"Bearer {key}"
    return headers | (extra or {})


def ensure_bucket():
    res = httpx.post(
        f"{BASE}/bucket",
        headers=_headers(),
        json={"id": settings.bucket, "name": settings.bucket, "public": False},
        timeout=20,
    )
    if res.status_code >= 400 and "exist" not in res.text.lower():
        res.raise_for_status()


def upload(path, data, content_type="application/pdf"):
    res = httpx.post(
        f"{BASE}/object/{settings.bucket}/{path}",
        headers=_headers({"Content-Type": content_type, "x-upsert": "true"}),
        content=data,
        timeout=120,
    )
    res.raise_for_status()


def download(path) -> bytes:
    res = httpx.get(f"{BASE}/object/{settings.bucket}/{path}", headers=_headers(), timeout=120)
    res.raise_for_status()
    return res.content


def remove(paths):
    if not paths:
        return
    httpx.request(
        "DELETE",
        f"{BASE}/object/{settings.bucket}",
        headers=_headers(),
        json={"prefixes": list(paths)},
        timeout=30,
    )
