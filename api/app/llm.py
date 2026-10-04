import logging
import math
import random
import re
import threading
import time
from typing import Iterator, TypeVar

from google import genai
from google.genai import errors, types
from pydantic import BaseModel

from .config import settings

T = TypeVar("T", bound=BaseModel)

log = logging.getLogger("coursemind.llm")
client = genai.Client(api_key=settings.gemini_api_key)
RETRY_CODES = {429, 500, 502, 503, 504}
BUSY_CODES = {500, 502, 503, 504}
NO_TOOLS = types.AutomaticFunctionCallingConfig(disable=True)


class OutOfQuota(Exception):
    def __init__(self, wait):
        self.wait = wait
        minutes = max(1, round(wait / 60))
        super().__init__(f"Gemini is busy or out of free requests right now. It picks up again in about {minutes} min.")


class Pace:
    def __init__(self, per_minute):
        self.gap = 60 / per_minute
        self.next_at = 0.0
        self.lock = threading.Lock()

    def wait(self):
        with self.lock:
            now = time.monotonic()
            start = max(now, self.next_at)
            self.next_at = start + self.gap
        if start > now:
            time.sleep(start - now)


_paces: dict[str, Pace] = {}
_out_until: dict[str, float] = {}
_lock = threading.Lock()


def _pace(model):
    with _lock:
        if model not in _paces:
            rpm = settings.embed_rpm if model == settings.embed_model else settings.llm_rpm
            _paces[model] = Pace(rpm)
        return _paces[model]


def _used_up(e):
    if e.code != 429:
        return None
    text = str(e)
    if "limit: 0" in text:
        return 24 * 3600.0
    if "PerDay" not in text:
        return None
    match = re.search(r"retryDelay['\"]?:\s*['\"](\d+)", text)
    return float(match.group(1)) if match else 3600.0


def _skip_for(e):
    if e.code in BUSY_CODES:
        return 300.0
    return _used_up(e)


def _with_retries(model, call, tries=4):
    for attempt in range(tries):
        _pace(model).wait()
        try:
            return call()
        except errors.APIError as e:
            if e.code not in RETRY_CODES or _used_up(e) is not None or attempt == tries - 1:
                raise
            if e.code in BUSY_CODES and attempt >= 1:
                raise
            time.sleep(min(60, 4 * 2**attempt) + random.random() * 2)


def _models(smart):
    names = settings.smart_models if smart else settings.fast_models
    return [n.strip() for n in names.split(",") if n.strip()]


def _available(models):
    now = time.time()
    ready = [m for m in models if _out_until.get(m, 0) <= now]
    if not ready:
        raise OutOfQuota(min(_out_until[m] for m in models) - now)
    return ready


def _skip(model, wait):
    _out_until[model] = time.time() + wait
    log.warning("skipping %s for %s min, trying the next model", model, max(1, round(wait / 60)))


def _config(system=None, schema=None, quick=False, low_res=False):
    return types.GenerateContentConfig(
        system_instruction=system,
        response_mime_type="application/json" if schema else None,
        response_schema=schema,
        media_resolution=types.MediaResolution.MEDIA_RESOLUTION_LOW if low_res else None,
        thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW) if quick else None,
        automatic_function_calling=NO_TOOLS,
    )


def ask(prompt, schema: type[T], *, smart=False, quick=False, system=None, files=(), low_res=False) -> T:
    config = _config(system, schema, quick, low_res)
    models = _models(smart)
    while True:
        model = _available(models)[0]
        try:
            res = _with_retries(
                model,
                lambda: client.models.generate_content(model=model, contents=[*files, prompt], config=config),
            )
        except errors.APIError as e:
            wait = _skip_for(e)
            if wait is None:
                raise
            _skip(model, wait)
            continue
        if isinstance(res.parsed, schema):
            return res.parsed
        return schema.model_validate_json(res.text or "{}")


def stream(prompt, *, system=None) -> Iterator[str]:
    config = _config(system, quick=True)
    models = _models(smart=True)
    attempt = 0
    while True:
        model = _available(models)[0]
        _pace(model).wait()
        sent = False
        try:
            for part in client.models.generate_content_stream(model=model, contents=prompt, config=config):
                if part.text:
                    sent = True
                    yield part.text
            return
        except errors.APIError as e:
            if sent:
                raise
            wait = _skip_for(e)
            if wait is not None:
                _skip(model, wait)
                continue
            attempt += 1
            if e.code not in RETRY_CODES or attempt > 3:
                raise
            time.sleep(3 * 2**attempt)


def embed(texts, *, query=False, title="none") -> list[list[float]]:
    model = settings.embed_model
    if _out_until.get(model, 0) > time.time():
        raise OutOfQuota(_out_until[model] - time.time())

    vectors = []
    for i in range(0, len(texts), 50):
        batch = [_embed_text(t, query, title) for t in texts[i : i + 50]]
        contents = [types.Content(parts=[types.Part.from_text(text=t)]) for t in batch]
        try:
            res = _with_retries(
                model,
                lambda: client.models.embed_content(
                    model=model,
                    contents=contents,
                    config=types.EmbedContentConfig(output_dimensionality=768),
                ),
            )
        except errors.APIError as e:
            wait = _used_up(e)
            if wait is None:
                raise
            _skip(model, wait)
            raise OutOfQuota(wait)
        vectors.extend(_unit(e.values) for e in res.embeddings)
    return vectors


def _embed_text(text, query, title):
    if query:
        return f"task: search result | query: {text}"
    return f"title: {title} | text: {text}"


def _unit(values):
    size = math.sqrt(sum(v * v for v in values)) or 1.0
    return [v / size for v in values]


def friendly_error(e: Exception) -> str:
    if isinstance(e, errors.APIError):
        if e.code == 429:
            return "Hit Gemini's free limit. It will try again in a few minutes."
        if e.code in BUSY_CODES:
            return "Gemini is overloaded right now. Try again in a minute."
        if e.code in (401, 403):
            return "Gemini rejected the API key. Check GEMINI_API_KEY in api/.env."
        if e.code == 400:
            return f"Gemini couldn't read this: {e.message}"
    return str(e)[:300] or e.__class__.__name__
