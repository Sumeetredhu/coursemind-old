"use client";

import { X } from "lucide-react";
import dynamic from "next/dynamic";
import { createContext, useContext, useState, type ReactNode } from "react";
import type { Citation } from "@/lib/types";
import { Spinner } from "./ui";

const PdfViewer = dynamic(() => import("./PdfViewer"), {
  ssr: false,
  loading: () => (
    <div className="p-6">
      <Spinner label="Opening PDF…" />
    </div>
  ),
});

type ViewerValue = { citation: Citation | null; open: (citation: Citation) => void; close: () => void };

const ViewerContext = createContext<ViewerValue>({ citation: null, open: () => {}, close: () => {} });

export function ViewerProvider({ children }: { children: ReactNode }) {
  const [citation, setCitation] = useState<Citation | null>(null);
  return (
    <ViewerContext.Provider value={{ citation, open: setCitation, close: () => setCitation(null) }}>
      {children}
    </ViewerContext.Provider>
  );
}

export function useViewer() {
  return useContext(ViewerContext);
}

export function SourcePanel() {
  const { citation, close } = useViewer();
  if (!citation) return null;

  return (
    <aside className="fixed inset-0 z-40 flex flex-col bg-white lg:static lg:z-auto lg:w-[45%] lg:max-w-3xl lg:border-l lg:border-stone-200">
      <div className="flex items-start gap-3 border-b border-stone-200 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-stone-900">{citation.title}</p>
          <p className="text-xs text-stone-500">{citation.label}</p>
        </div>
        <button onClick={close} className="rounded-md p-1.5 text-stone-500 hover:bg-stone-100" title="Close">
          <X size={18} />
        </button>
      </div>

      {citation.kind === "youtube" ? (
        <div className="flex-1 overflow-auto">
          <iframe
            key={citation.id}
            src={`https://www.youtube-nocookie.com/embed/${citation.video_id}?start=${Math.floor(citation.start ?? 0)}&autoplay=1&rel=0`}
            className="aspect-video w-full bg-black"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            title={citation.title}
          />
          {citation.snippet && (
            <div className="p-4">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-400">What was said here</p>
              <p className="text-sm leading-relaxed text-stone-700">{citation.snippet}…</p>
            </div>
          )}
        </div>
      ) : (
        <PdfViewer key={citation.id} sourceId={citation.source_id} page={citation.page ?? 1} box={citation.bbox} />
      )}
    </aside>
  );
}
