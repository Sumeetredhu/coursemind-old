"use client";

import { RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Citation, Course, NotesResponse, TopicNotes } from "@/lib/types";
import { Cites } from "../Cite";
import { Markdown } from "../Markdown";
import { Button, Empty, ErrorNote, Spinner } from "../ui";

export function NotesTab({ course, reload }: { course: Course; reload: () => void }) {
  const [data, setData] = useState<NotesResponse | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  const written = course.topics.filter((t) => t.has_notes).length;
  const materials = course.sources.filter((s) => s.role === "material");
  const ready = materials.filter((s) => s.status === "ready").length;
  const stillReading = materials.some((s) => s.status === "queued" || s.status === "processing");
  const building = course.notes_status === "queued" || course.notes_status === "building";

  useEffect(() => {
    api<NotesResponse>(`/courses/${course.id}/notes`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [course.id, course.notes_status, written]);

  async function make() {
    if (course.notes_status === "ready" && !confirm("Make the notes again? This replaces your notes and flashcards.")) {
      return;
    }
    setStarting(true);
    setError("");
    try {
      await api(`/courses/${course.id}/notes`, { method: "POST" });
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  }

  if (building) {
    const total = course.topics.length;
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-6">
        <p className="flex items-center gap-2 font-semibold">
          <Sparkles size={18} className="text-teal-700" />
          Making your notes…
        </p>
        <p className="mt-1 text-sm text-stone-500">
          {total
            ? `${written} of ${total} topics written. Flashcards are made along the way.`
            : "Reading all your sources and splitting them into topics. This takes a minute or two."}
        </p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-stone-100">
          <div
            className="h-full rounded-full bg-teal-600 transition-all duration-700"
            style={{ width: `${total ? Math.max(8, (written / total) * 100) : 5}%` }}
          />
        </div>
        {course.notes_error && <p className="mt-3 text-sm text-amber-700">{course.notes_error}</p>}
      </div>
    );
  }

  if (!data && !error) return <Spinner label="Loading notes…" />;

  const topics = data?.topics.filter((t) => t.notes) ?? [];

  if (course.notes_status !== "ready" || topics.length === 0) {
    return (
      <div className="space-y-4">
        {course.notes_status === "failed" && <ErrorNote>Making notes failed: {course.notes_error}</ErrorNote>}
        <ErrorNote>{error}</ErrorNote>
        <Empty
          title="No notes yet"
          action={
            <Button onClick={make} busy={starting} disabled={ready === 0}>
              <Sparkles size={16} />
              {course.notes_status === "failed"
                ? "Continue where it stopped"
                : `Make notes from ${ready} ${ready === 1 ? "source" : "sources"}`}
            </Button>
          }
        >
          {ready === 0
            ? "Add a lecture or some slides in the Sources tab first."
            : "We'll split your material into topics and write short notes for each, with a link on every point to where it came from."}
          {stillReading && <p className="mt-2 text-amber-700">Some sources are still being read. Wait for them to include them too.</p>}
        </Empty>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notes</h1>
          <p className="mt-1 text-sm text-stone-500">
            {topics.length} topics. Click any highlighted tag to see exactly where a point came from.
          </p>
        </div>
        <Button variant="secondary" onClick={make} busy={starting}>
          <RefreshCw size={15} />
          Remake
        </Button>
      </div>
      <ErrorNote>{error}</ErrorNote>

      <div className="mt-6 grid gap-8 xl:grid-cols-[180px_1fr]">
        <nav className="hidden xl:block">
          <div className="sticky top-16 space-y-1">
            {topics.map((t, i) => (
              <a
                key={t.id}
                href={`#topic-${t.id}`}
                className="block rounded-md px-2 py-1 text-sm text-stone-500 hover:bg-stone-100 hover:text-stone-900"
              >
                {i + 1}. {t.title}
              </a>
            ))}
          </div>
        </nav>
        <div className="space-y-6">
          {topics.map((t, i) => (
            <Topic
              key={t.id}
              id={t.id}
              index={i}
              title={t.title}
              notes={t.notes as TopicNotes}
              citations={data?.citations ?? {}}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

type TopicProps = { id: string; index: number; title: string; notes: TopicNotes; citations: Record<string, Citation> };

function Topic({ id, index, title, notes, citations }: TopicProps) {
  return (
    <article id={`topic-${id}`} className="scroll-mt-16 rounded-2xl border border-stone-200 bg-white p-6 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">Topic {index + 1}</p>
      <h2 className="mt-1 text-xl font-semibold tracking-tight">{title}</h2>
      {notes.overview && (
        <div className="mt-2 text-stone-600">
          <Markdown text={notes.overview} />
        </div>
      )}

      {notes.sections.map((section) => (
        <section key={section.heading} className="mt-7">
          <h3 className="font-semibold text-stone-900">{section.heading}</h3>
          <ul className="mt-2 space-y-2.5">
            {section.points.map((point, i) => (
              <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-stone-800">
                <span className="mt-[11px] size-1.5 shrink-0 rounded-full bg-teal-600/60" />
                <div>
                  <Markdown inline text={point.text} /> <Cites ids={point.cites} citations={citations} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {notes.terms.length > 0 && (
        <section className="mt-7 rounded-xl bg-stone-50 p-4">
          <h3 className="text-sm font-semibold text-stone-900">Key terms</h3>
          <dl className="mt-2 space-y-2 text-sm leading-relaxed">
            {notes.terms.map((term) => (
              <div key={term.term}>
                <dt className="inline font-semibold">{term.term}: </dt>
                <dd className="inline text-stone-700">
                  <Markdown inline text={term.meaning} /> <Cites ids={term.cites} citations={citations} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </article>
  );
}
