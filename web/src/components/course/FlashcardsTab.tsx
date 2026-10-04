"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { CardsResponse, Course } from "@/lib/types";
import { Cites } from "../Cite";
import { Markdown } from "../Markdown";
import { Button, Empty, ErrorNote, Spinner } from "../ui";
import { TopicSelect } from "./TopicSelect";

const GRADES = [
  { id: "again", label: "Again", hint: "10 min", style: "border-red-200 text-red-700 hover:bg-red-50" },
  { id: "hard", label: "Hard", hint: "soon", style: "border-amber-200 text-amber-700 hover:bg-amber-50" },
  { id: "good", label: "Good", hint: "later", style: "border-emerald-200 text-emerald-700 hover:bg-emerald-50" },
  { id: "easy", label: "Easy", hint: "much later", style: "border-sky-200 text-sky-700 hover:bg-sky-50" },
] as const;

export function FlashcardsTab({ course }: { course: Course }) {
  const [mode, setMode] = useState<"review" | "all">("review");
  const [topic, setTopic] = useState("");
  const [data, setData] = useState<CardsResponse | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (mode === "review") params.set("due", "true");
    if (topic) params.set("topic_id", topic);
    return api<CardsResponse>(`/courses/${course.id}/flashcards?${params}`)
      .then((d) => {
        setData(d);
        setIndex(0);
        setFlipped(false);
      })
      .catch((e) => setError(e.message));
  }, [course.id, mode, topic]);

  useEffect(() => {
    load();
  }, [load]);

  const card = data?.cards[index];

  const grade = useCallback(
    async (value: string) => {
      if (!card) return;
      setFlipped(false);
      setIndex((i) => i + 1);
      try {
        await api(`/flashcards/${card.id}/review`, { body: { grade: value } });
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [card],
  );

  useEffect(() => {
    if (mode !== "review" || !card) return;
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      if (e.key === " ") {
        e.preventDefault();
        setFlipped(true);
      }
      if (flipped && ["1", "2", "3", "4"].includes(e.key)) grade(GRADES[Number(e.key) - 1].id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, card, flipped, grade]);

  if (!data && !error) return <Spinner label="Loading flashcards…" />;

  if (data && data.total === 0) {
    return (
      <Empty title="No flashcards yet">
        Flashcards get made together with your notes. Make notes first, then come back here.
      </Empty>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Flashcards</h1>
          <p className="mt-1 text-sm text-stone-500">
            {data?.due ?? 0} due now out of {data?.total ?? 0}. Cards you find easy come back less often.
          </p>
        </div>
        <div className="flex rounded-lg bg-stone-100 p-1 text-sm">
          {(["review", "all"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1 font-medium ${mode === m ? "bg-white shadow-sm" : "text-stone-500"}`}
            >
              {m === "review" ? "Review" : "All cards"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <TopicSelect topics={course.topics} value={topic} onChange={setTopic} anyLabel="All topics" />
      </div>
      <div className="mt-4">
        <ErrorNote>{error}</ErrorNote>
      </div>

      {mode === "review" && data && (
        <div className="mt-6">
          {card ? (
            <>
              <p className="mb-2 text-xs text-stone-400">
                Card {index + 1} of {data.cards.length}
                {card.topic && ` · ${card.topic}`}
              </p>
              <div
                onClick={() => setFlipped(true)}
                className="min-h-64 cursor-pointer rounded-2xl border border-stone-200 bg-white p-8 shadow-sm"
              >
                <div className="text-lg font-medium leading-relaxed">
                  <Markdown text={card.front} />
                </div>
                {flipped ? (
                  <div className="mt-6 border-t border-dashed border-stone-200 pt-6 text-stone-700">
                    <Markdown text={card.back} />
                    <div className="mt-3">
                      <Cites ids={card.cites} citations={data.citations} />
                    </div>
                  </div>
                ) : (
                  <p className="mt-10 text-sm text-stone-400">Think of the answer, then click or press space</p>
                )}
              </div>
              {flipped && (
                <div className="mt-4 grid grid-cols-4 gap-2">
                  {GRADES.map((g, i) => (
                    <button
                      key={g.id}
                      onClick={() => grade(g.id)}
                      className={`rounded-xl border bg-white py-2.5 text-sm font-medium ${g.style}`}
                    >
                      {g.label}
                      <span className="block text-xs font-normal opacity-60">
                        {g.hint} · {i + 1}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <Empty
              title={data.cards.length ? "That's all for now" : "Nothing due right now"}
              action={
                <Button variant="secondary" onClick={() => setMode("all")}>
                  Browse all cards
                </Button>
              }
            >
              Come back later and the cards you need to see again will be waiting.
            </Empty>
          )}
        </div>
      )}

      {mode === "all" && data && (
        <ul className="mt-6 divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white">
          {data.cards.map((c) => (
            <li key={c.id} className="grid gap-2 p-4 text-sm sm:grid-cols-2 sm:gap-6">
              <div className="font-medium">
                <Markdown text={c.front} />
              </div>
              <div className="text-stone-600">
                <Markdown text={c.back} /> <Cites ids={c.cites} citations={data.citations} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
