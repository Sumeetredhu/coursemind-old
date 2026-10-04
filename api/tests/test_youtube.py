from app.ingest.youtube import clean, group, video_id


def test_video_id_from_different_links():
    assert video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert video_id("https://youtu.be/dQw4w9WgXcQ?t=42") == "dQw4w9WgXcQ"
    assert video_id("https://www.youtube.com/shorts/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert video_id("https://www.youtube.com/live/dQw4w9WgXcQ?si=abc") == "dQw4w9WgXcQ"
    assert video_id("dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert video_id("https://example.com/video") is None


def test_clean_removes_noise():
    assert clean("[Music] so today we&#39;ll   start") == "so today we'll start"


def test_group_makes_time_windows():
    lines = [(i * 10.0, 10.0, f"line {i}") for i in range(20)]
    pieces = group(lines, window=60)
    assert len(pieces) == 4
    assert pieces[0].start == 0 and pieces[0].end == 60
    assert pieces[1].start == 60
    assert pieces[-1].end == 200
    assert "line 0" in pieces[0].text and "line 5" in pieces[0].text


def test_group_skips_empty_lines():
    pieces = group([(0, 5, "[Music]"), (5, 5, "hello"), (10, 5, "  ")], window=60)
    assert len(pieces) == 1
    assert pieces[0].text == "hello"
    assert pieces[0].start == 5
