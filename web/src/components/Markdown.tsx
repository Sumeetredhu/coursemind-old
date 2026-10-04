"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { Citation } from "@/lib/types";
import { Cite } from "./Cite";

const SKIP = /(`[^`]*`|\$\$[\s\S]*?\$\$|\$[^$\n]*\$)/;

function linkMarkers(text: string) {
  return text
    .split(SKIP)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (_, numbers: string) =>
            numbers
              .split(",")
              .map((n) => `[${n.trim()}](#cite-${n.trim()})`)
              .join(""),
          ),
    )
    .join("");
}

type Props = { text: string; sources?: Citation[]; inline?: boolean };

export function Markdown({ text, sources, inline }: Props) {
  const components: Components = {
    a({ href, children }) {
      if (href?.startsWith("#cite-")) {
        const citation = sources?.[Number(href.slice(6)) - 1];
        return citation ? <Cite citation={citation} /> : null;
      }
      return (
        <a href={href} target="_blank" rel="noreferrer" className="text-teal-700 underline">
          {children}
        </a>
      );
    },
  };
  if (inline) components.p = ({ children }) => <>{children}</>;

  return (
    <div className={inline ? "md inline" : "md"}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={components}>
        {sources?.length ? linkMarkers(text) : text}
      </ReactMarkdown>
    </div>
  );
}
