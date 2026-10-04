import pymupdf

from app.ingest import pdf


def make_pdf(pages):
    doc = pymupdf.open()
    for lines in pages:
        page = doc.new_page()
        y = 72
        for line in lines:
            page.insert_text((72, y), line)
            y += 20
    data = doc.tobytes()
    doc.close()
    return data


def test_read_keeps_page_numbers_and_boxes():
    data = make_pdf([["Paging splits memory into fixed size frames."], ["A TLB caches page table entries."]])
    pieces, scanned, count = pdf.read(data)
    assert count == 2
    assert scanned == []
    assert [p.page for p in pieces] == [1, 2]
    assert "TLB" in pieces[1].text
    x0, y0, x1, y1 = pieces[0].bbox
    assert 0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1


def test_merge_splits_long_pages():
    block = (0, 0, 100, 10, " ".join(["word"] * 150), 0, 0)
    pieces = pdf.merge([block, block, block], page=3, width=600, height=800)
    assert len(pieces) == 3
    assert all(p.page == 3 for p in pieces)


def test_page_count():
    assert pdf.page_count(make_pdf([["a"], ["b"], ["c"]])) == 3
