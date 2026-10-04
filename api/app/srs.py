from datetime import timedelta

GRADES = ("again", "hard", "good", "easy")


def review(card, grade, now):
    ease = card["ease"]
    interval = card["interval_days"]
    reps = card["reps"]
    lapses = card["lapses"]

    if grade == "again":
        reps, lapses = 0, lapses + 1
        ease = max(1.3, ease - 0.2)
        interval = 0
        due = now + timedelta(minutes=10)
    else:
        if grade == "hard":
            interval = max(1, interval * 1.2)
            ease = max(1.3, ease - 0.15)
        elif grade == "good":
            interval = 1 if reps == 0 else 3 if reps == 1 else interval * ease
        else:
            interval = 3 if reps == 0 else max(4, interval * ease * 1.3)
            ease += 0.15
        reps += 1
        due = now + timedelta(days=interval)

    return {
        "ease": round(ease, 2),
        "interval_days": round(interval, 2),
        "reps": reps,
        "lapses": lapses,
        "due_at": due,
    }
