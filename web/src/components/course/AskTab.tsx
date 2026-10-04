"use client";

import { Send } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ask } from "@/lib/api";
import type { Citation, Course } from "@/lib/types";
import { Cite } from "../Cite";
import { Markdown } from "../Markdown";
import { ErrorNote, Spinner } from "../ui";

type Message = {
  role: "user" | "assistant";
  text: string;
  sources?: Citation[];
  error?: string;
  pending?: boolean;
};

const STARTERS = [
  "Explain the main ideas of this course simply",
  "What are the most important definitions?",
  "Give me one tricky exam-style question with its answer",
];

function citedSources(message: Message) {
  const used = new Set<number>();
  for (const match of message.text.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)) {
    match[1].split(",").forEach((n) => used.add(Number(n)));
  }
  return (message.sources ?? []).filter((_, i) => used.has(i + 1));
}

export function AskTab({ course }: { course: Course }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  function updateLast(change: (m: Message) => Message) {
    setMessages((list) => [...list.slice(0, -1), change(list[list.length - 1])]);
  }

  async function send(question: string) {
    question = question.trim();
    if (!question || busy) return;
    const history = messages.filter((m) => !m.error && m.text).map((m) => ({ role: m.role, text: m.text }));
    setMessages((list) => [...list, { role: "user", text: question }, { role: "assistant", text: "", pending: true }]);
    setInput("");
    setBusy(true);
    try {
      await ask(course.id, question, history, {
        onSources: (sources) => updateLast((m) => ({ ...m, sources })),
        onText: (text) => updateLast((m) => ({ ...m, text: m.text + text })),
        onError: (message) => updateLast((m) => ({ ...m, error: message })),
      });
    } catch (e) {
      updateLast((m) => ({ ...m, error: (e as Error).message }));
    } finally {
      updateLast((m) => ({ ...m, pending: false }));
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  return (
    <div className="flex min-h-[calc(100vh-11rem)] flex-col">
      <h1 className="text-2xl font-semibold tracking-tight">Ask</h1>
      <p className="mt-1 text-sm text-stone-500">
        Ask anything about this course. Answers only use your own material, with a tag on every claim.
      </p>

      <div className="flex-1 space-y-6 py-6">
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {STARTERS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-full border border-stone-200 bg-white px-3.5 py-1.5 text-sm text-stone-600 hover:border-teal-600 hover:text-teal-800"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-md bg-teal-700 px-4 py-2.5 text-sm text-white">{m.text}</p>
            </div>
          ) : (
            <div key={i} className="max-w-[95%]">
              {m.pending && !m.text && !m.error && <Spinner label="Looking through your material…" />}
              {m.text && (
                <div className="text-[15px] text-stone-800">
                  <Markdown text={m.text} sources={m.sources} />
                </div>
              )}
              {m.error && <ErrorNote>{m.error}</ErrorNote>}
              {!m.pending && citedSources(m).length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1 text-xs text-stone-400">
                  Sources:
                  {citedSources(m).map((c) => (
                    <span key={c.id} className="inline-flex items-center gap-1">
                      <Cite citation={c} />
                      <span className="max-w-40 truncate text-stone-500">{c.title}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ),
        )}
        <div ref={bottom} />
      </div>

      <form onSubmit={submit} className="sticky bottom-4 flex gap-2 rounded-2xl border border-stone-200 bg-white p-2 shadow-sm">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about this course…"
          className="flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-stone-400"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="grid size-9 place-items-center rounded-xl bg-teal-700 text-white disabled:bg-stone-200 disabled:text-stone-400"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
