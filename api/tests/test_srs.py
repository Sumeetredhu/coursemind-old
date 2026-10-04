from datetime import datetime, timedelta, timezone

from app.srs import review

NOW = datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc)
NEW_CARD = {"ease": 2.5, "interval_days": 0, "reps": 0, "lapses": 0}


def test_good_grows_the_gap():
    first = review(NEW_CARD, "good", NOW)
    assert first["interval_days"] == 1
    second = review(first, "good", NOW)
    assert second["interval_days"] == 3
    third = review(second, "good", NOW)
    assert third["interval_days"] == 7.5
    assert third["due_at"] == NOW + timedelta(days=7.5)


def test_again_brings_it_back_soon():
    card = {"ease": 2.5, "interval_days": 10, "reps": 4, "lapses": 0}
    result = review(card, "again", NOW)
    assert result["reps"] == 0
    assert result["lapses"] == 1
    assert result["due_at"] == NOW + timedelta(minutes=10)
    assert result["ease"] == 2.3


def test_ease_never_drops_too_low():
    card = {"ease": 1.35, "interval_days": 2, "reps": 2, "lapses": 3}
    assert review(card, "again", NOW)["ease"] == 1.3
    assert review(card, "hard", NOW)["ease"] == 1.3


def test_easy_jumps_ahead():
    result = review(NEW_CARD, "easy", NOW)
    assert result["interval_days"] == 3
    assert result["ease"] == 2.65
