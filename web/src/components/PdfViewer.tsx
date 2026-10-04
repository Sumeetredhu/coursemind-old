"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import { pdfUrl } from "@/lib/api";
import { Spinner } from "./ui";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

type Props = { sourceId: string; page: number; box: number[] | null };

export default function PdfViewer({ sourceId, page, box }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pages, setPages] = useState(0);
  const [current, setCurrent] = useState(page);
  const [width, setWidth] = useState(560);
  const frame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    pdfUrl(sourceId)
      .then(setUrl)
      .catch((e) => setError(e.message));
  }, [sourceId]);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width - 32)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-stone-200 px-4 py-2 text-sm text-stone-600">
        <button
          onClick={() => setCurrent((p) => Math.max(1, p - 1))}
          disabled={current <= 1}
          className="rounded-md p-1 hover:bg-stone-100 disabled:opacity-30"
        >
          <ChevronLeft size={18} />
        </button>
        <span>
          Page {current}
          {pages ? ` of ${pages}` : ""}
        </span>
        <button
          onClick={() => setCurrent((p) => Math.min(pages || p, p + 1))}
          disabled={!!pages && current >= pages}
          className="rounded-md p-1 hover:bg-stone-100 disabled:opacity-30"
        >
          <ChevronRight size={18} />
        </button>
        {current !== page && (
          <button onClick={() => setCurrent(page)} className="ml-auto text-xs font-medium text-teal-700 hover:underline">
            Back to page {page}
          </button>
        )}
      </div>

      <div ref={frame} className="flex-1 overflow-auto bg-stone-100 p-4">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!url && !error && <Spinner label="Loading PDF…" />}
        {url && (
          <Document
            file={url}
            suspense={false}
            onLoadSuccess={(doc) => setPages(doc.numPages)}
            loading={<Spinner label="Loading PDF…" />}
            error={<p className="text-sm text-red-600">Couldn&apos;t open this PDF.</p>}
          >
            <div className="relative mx-auto bg-white shadow-sm" style={{ width }}>
              <Page
                pageNumber={current}
                width={width}
                renderAnnotationLayer={false}
                loading={<div style={{ height: width * 1.3 }} />}
              />
              {box && current === page && (
                <div
                  className="pointer-events-none absolute rounded-sm bg-amber-300/30 ring-2 ring-amber-400"
                  style={{
                    left: `${box[0] * 100}%`,
                    top: `${box[1] * 100}%`,
                    width: `${(box[2] - box[0]) * 100}%`,
                    height: `${(box[3] - box[1]) * 100}%`,
                  }}
                />
              )}
            </div>
          </Document>
        )}
      </div>
    </div>
  );
}
