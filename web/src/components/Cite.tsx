"use client";

import { FileText, Play } from "lucide-react";
import { shortLabel } from "@/lib/format";
import type { Citation } from "@/lib/types";
import { useViewer } from "./Viewer";

export function Cite({ citation }: { citation: Citation }) {
  const { open } = useViewer();
  const Icon = citation.kind === "youtube" ? Play : FileText;
  return (
    <button
      type="button"
      onClick={() => open(citation)}
      title={`${citation.title}, ${citation.label}${citation.snippet ? `\n\n"${citation.snippet}…"` : ""}`}
      className="mx-0.5 inline-flex translate-y-[-1px] items-center gap-1 whitespace-nowrap rounded-md border border-amber-200 bg-amber-50 px-1.5 py-px align-middle text-[11px] font-medium leading-4 text-amber-900 transition-colors hover:border-amber-300 hover:bg-amber-100"
    >
      <Icon size={10} strokeWidth={2.5} />
      {shortLabel(citation)}
    </button>
  );
}

export function Cites({ ids, citations }: { ids: string[]; citations: Record<string, Citation> }) {
  const found = ids.map((id) => citations[id]).filter(Boolean);
  if (!found.length) return null;
  return (
    <>
      {found.map((c) => (
        <Cite key={c.id} citation={c} />
      ))}
    </>
  );
}
