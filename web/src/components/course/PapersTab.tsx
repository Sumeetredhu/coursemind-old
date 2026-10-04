"use client";

import { ChevronDown, FileText, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { plural } from "@/lib/format";
import type { Course, PaperQuestion, PapersResponse } from "@/lib/types";
import { Markdown } from "../Markdown";
import { Button, Empty, ErrorNote, Spinner, StatusBadge, field } from "../ui";

export function PapersTab({ course, reload }: { course: Course; reload: () => void }) {
  const [data, setData] = useState<PapersResponse | null>(null);
  const [year, setYear] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const picker = useRef<HTMLInputElement>(null);

  const papers = course.sources.filter((s) => s.role === "paper");
  const readyCount = papers.filter((s) => s.status === "ready").length;

  useEffect(() => {
    api<PapersResponse>(`/courses/${course.id}/papers`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [course.id, papers.length, readyCount, course.notes_status]);

  async function upload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    const form = new FormData();
    form.append("file", file);
    form.append("role", "paper");
    if (year.trim()) form.append("year", year.trim());
    try {
      await api(`/courses/${course.id}/pdf`, { form });
      setYear("");
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string, title: string) {
    if (!confirm(`Remove "${title}" and its questions?`)) return;
    await api(`/sources/${id}`, { method: "DELETE" });
    reload();
  }

  const questions = data?.questions ?? [];
  const totalYears = Math.max(data?.years.length ?? 0, 1);
  const asked = data?.topics.filter((t) => t.questions > 0) ?? [];
  const neverAsked = data?.topics.filter((t) => t.questions === 0) ?? [];
  const unmatched = questions.filter((q) => !q.topic_id);
  const most = Math.max(1, ...asked.map((t) => t.questions));

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Past papers</h1>
      <p className="mt-1 max-w-2xl text-sm text-stone-500">
        Upload old exam papers. Every question gets pulled out and matched to your topics, so you can see what
        actually gets asked.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl border border-stone-200 bg-white p-4">
        <input
          value={year}
          onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="Year (optional)"
          className={`${field} w-36`}
        />
        <Button onClick={() => picker.current?.click()} busy={uploading}>
          <Upload size={15} />
          Upload a paper
        </Button>
        <span className="text-xs text-stone-400">PDF, scanned is fine. One paper at a time.</span>
        <input
          ref={picker}
          type="file"
          accept="application/pdf"
          hidden
          onChange={(e) => {
            upload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      <div className="mt-3">
        <ErrorNote>{error}</ErrorNote>
      </div>

      {papers.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {papers.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-2 rounded-full border border-stone-200 bg-white py-1 pl-3 pr-1.5 text-sm"
            >
              <FileText size={14} className="text-stone-400" />
              <span className="max-w-56 truncate">{p.title}</span>
              {p.year && <span className="text-stone-400">{p.year}</span>}
              <StatusBadge status={p.status} />
              <button
                onClick={() => remove(p.id, p.title)}
                className="rounded-full p-1 text-stone-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8">
        {!data && !error && <Spinner label="Loading…" />}
        {data && questions.length === 0 && (
          <Empty title="No questions yet">
            Upload a few past papers. Three or more gives you a good picture of what comes every year.
          </Empty>
        )}

        {data && questions.length > 0 && data.topics.length === 0 && (
          <div className="space-y-4">
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Make your notes first. Once your course is split into topics, these questions get matched to them.
            </p>
            <QuestionList questions={questions} />
          </div>
        )}

        {data && asked.length > 0 && (
          <div>
            <h2 className="font-semibold">Most asked topics</h2>
            <p className="text-sm text-stone-500">
              From {plural(questions.length, "question")} across {plural(data.papers.length, "paper")}.
            </p>
            <div className="mt-4 space-y-2">
              {asked.map((t) => (
                <TopicRow
                  key={t.id}
                  title={t.title}
                  detail={`Asked in ${t.years} of ${totalYears} ${totalYears === 1 ? "year" : "years"} · ${plural(t.questions, "question")}${t.marks ? ` · ${t.marks} marks` : ""}`}
                  width={(t.questions / most) * 100}
                  questions={questions.filter((q) => q.topic_id === t.id)}
                />
              ))}
            </div>
            {unmatched.length > 0 && data.topics.length > 0 && (
              <div className="mt-2">
                <TopicRow
                  title="Didn't match any topic"
                  detail={plural(unmatched.length, "question")}
                  width={0}
                  questions={unmatched}
                />
              </div>
            )}
            {neverAsked.length > 0 && (
              <p className="mt-6 text-sm text-stone-500">
                <span className="font-medium text-stone-700">Not asked so far: </span>
                {neverAsked.map((t) => t.title).join(", ")}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

type RowProps = { title: string; detail: string; width: number; questions: PaperQuestion[] };

function TopicRow({ title, detail, width, questions }: RowProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-stone-200 bg-white">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-4 px-4 py-3 text-left">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="text-xs text-stone-500">{detail}</p>
          {width > 0 && (
            <div className="mt-2 h-1.5 rounded-full bg-stone-100">
              <div className="h-full rounded-full bg-teal-600" style={{ width: `${width}%` }} />
            </div>
          )}
        </div>
        <ChevronDown size={16} className={`text-stone-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-stone-100 px-4 py-3">
          <QuestionList questions={questions} />
        </div>
      )}
    </div>
  );
}

function QuestionList({ questions }: { questions: PaperQuestion[] }) {
  return (
    <ul className="space-y-3">
      {questions.map((q) => (
        <li key={q.id} className="text-sm">
          <p className="text-xs text-stone-400">
            {q.year ?? q.paper}
            {q.number && ` · Q${q.number}`}
            {q.marks ? ` · ${q.marks} marks` : ""}
          </p>
          <div className="text-stone-800">
            <Markdown text={q.text} />
          </div>
        </li>
      ))}
    </ul>
  );
}
