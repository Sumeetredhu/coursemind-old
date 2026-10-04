import html
import re

import httpx
from youtube_transcript_api import NoTranscriptFound, YouTubeTranscriptApi

from . import Piece

ID_PATTERN = re.compile(r"(?:v=|youtu\.be/|shorts/|live/|embed/)([\w-]{11})")
NOISE = re.compile(r"\[(?:music|applause|laughter|inaudible|silence)\]", re.IGNORECASE)
LANGUAGES = ["en", "en-IN", "en-US", "en-GB", "hi"]


def video_id(url):
    url = url.strip()
    match = ID_PATTERN.search(url)
    if match:
        return match.group(1)
    if re.fullmatch(r"[\w-]{11}", url):
        return url
    return None


def video_title(url):
    try:
        res = httpx.get("https://www.youtube.com/oembed", params={"url": url, "format": "json"}, timeout=10)
        if res.status_code == 200:
            return res.json()["title"]
    except httpx.HTTPError:
        pass
    return "YouTube video"


def transcript(vid):
    try:
        available = YouTubeTranscriptApi().list(vid)
        try:
            chosen = available.find_transcript(LANGUAGES)
        except NoTranscriptFound:
            chosen = next(iter(available))
        return [(line.start, line.duration, line.text) for line in chosen.fetch()]
    except Exception:
        return None


def clean(text):
    text = NOISE.sub(" ", html.unescape(text))
    return " ".join(text.split())


def group(lines, window=75):
    pieces = []
    words, start, end = [], None, 0.0
    for at, duration, text in lines:
        text = clean(text)
        if not text:
            continue
        if start is None:
            start = at
        words.append(text)
        end = at + duration
        if end - start >= window:
            pieces.append(Piece(text=" ".join(words), start=start, end=end))
            words, start = [], None
    if words:
        pieces.append(Piece(text=" ".join(words), start=start, end=end))
    return pieces
