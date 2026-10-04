import pymupdf

from . import Piece

MAX_WORDS = 220


def read(data):
    doc = pymupdf.open(stream=data, filetype="pdf")
    pieces, scanned = [], []
    for page in doc:
        number = page.number + 1
        blocks = [b for b in page.get_text("blocks", sort=True) if b[6] == 0 and b[4].strip()]
        letters = sum(len(b[4].strip()) for b in blocks)
        if letters < 40 and page.get_images():
            scanned.append((number, page.get_pixmap(dpi=110).tobytes("png")))
            continue
        if blocks:
            pieces.extend(merge(blocks, number, page.rect.width, page.rect.height))
    count = doc.page_count
    doc.close()
    return pieces, scanned, count


def page_count(data):
    with pymupdf.open(stream=data, filetype="pdf") as doc:
        return doc.page_count


def merge(blocks, page, width, height):
    pieces, group, words = [], [], 0
    for block in blocks:
        size = len(block[4].split())
        if group and words + size > MAX_WORDS:
            pieces.append(_piece(group, page, width, height))
            group, words = [], 0
        group.append(block)
        words += size
    if group:
        pieces.append(_piece(group, page, width, height))
    return pieces


def _piece(group, page, width, height):
    text = " ".join(" ".join(b[4].split()) for b in group)
    box = [
        min(b[0] for b in group) / width,
        min(b[1] for b in group) / height,
        max(b[2] for b in group) / width,
        max(b[3] for b in group) / height,
    ]
    return Piece(text=text, page=page, bbox=[round(min(max(v, 0), 1), 4) for v in box])
