from dataclasses import dataclass


@dataclass
class Piece:
    text: str
    page: int | None = None
    bbox: list[float] | None = None
    start: float | None = None
    end: float | None = None
