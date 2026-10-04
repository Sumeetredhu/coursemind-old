"use client";

import { Check, X } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import type { Course, Quiz, QuizResults } from "@/lib/types";
import { Cites } from "../Cite";
import { Markdown } from "../Markdown";
import { Button, Empty, ErrorNote, Spinner, field } from "../ui";
import { TopicSelect } from "./TopicSelect";

export function QuizTab({ course }: { course: Course }) {
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(8);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [results, setResults] = useState<QuizResults | null>(null);
  const [making, setMaking] = useState(false);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState("");

  const hasMaterial = course.sources.some((s) => s.role === "material" && s.status === "ready");

  async function start() {
    setMaking(true);
    setError("");
    try {
      const q = await api<Quiz>(`/courses/${course.id}/quizzes`, { body: { topic_id: topic || null, count } });
      setQuiz(q);
      setAnswers(q.questions.map(() => ""));
      setResults(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMaking(false);
    }
  }

  async function submit() {
    if (!quiz) return;
    setGrading(true);
    setError("");
    try {
      setResults(await api<QuizResults>(`/quizzes/${quiz.id}/submit`, { body: { answers } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGrading(false);
    }
  }

  function answer(i: number, value: string) {
    setAnswers((list) => list.map((a, j) => (j === i ? value : a)));
  }

  if (!hasMaterial) {
    return <Empty title="Nothing to quiz on yet">Add some sources first, then come back for a quiz.</Empty>;
  }

  if (!quiz || making) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Quiz</h1>
        <p className="mt-1 text-sm text-stone-500">
          A fresh quiz from your material, in the style of your past papers if you added any.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl border border-stone-200 bg-white p-4">
          <TopicSelect topics={course.topics} value={topic} onChange={setTopic} anyLabel="Whole course" />
          <select value={count} onChange={(e) => setCount(Number(e.target.value))} className={`${field} w-40`}>
            {[5, 8, 10, 15].map((n) => (
              <option key={n} value={n}>
                {n} questions
              </option>
            ))}
          </select>
          <Button onClick={start} busy={making}>
            {making ? "Writing your quiz…" : "Start quiz"}
          </Button>
        </div>
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Quiz</h1>
          {results ? (
            <p className="mt-1 text-sm text-stone-500">You scored</p>
          ) : (
            <p className="mt-1 text-sm text-stone-500">{quiz.questions.length} questions. Take your time.</p>
          )}
        </div>
        <Button variant="secondary" onClick={() => setQuiz(null)}>
          New quiz
        </Button>
      </div>

      {results && (
        <p className="mt-2 text-5xl font-semibold tracking-tight text-teal-700">{Math.round(results.score)}%</p>
      )}

      <ol className="mt-8 space-y-5">
        {quiz.questions.map((q, i) => {
          const result = results?.results[i];
          return (
            <li key={i} className="rounded-2xl border border-stone-200 bg-white p-6">
              <div className="flex gap-3">
                <span className="text-sm font-semibold text-stone-400">{i + 1}.</span>
                <div className="flex-1 font-medium">
                  <Markdown text={q.question} />
                </div>
                {result && <Score value={result.score} />}
              </div>

              <div className="mt-4 pl-6">
                {q.kind === "mcq" ? (
                  <div className="space-y-2">
                    {q.options.map((option) => {
                      const chosen = answers[i] === option;
                      const right = result && option === result.answer;
                      const wrong = result && chosen && !right;
                      return (
                        <label
                          key={option}
                          className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-2.5 text-sm ${
                            right
                              ? "border-emerald-300 bg-emerald-50"
                              : wrong
                                ? "border-red-300 bg-red-50"
                                : chosen
                                  ? "border-teal-600 bg-teal-50"
                                  : "border-stone-200 hover:border-stone-300"
                          }`}
                        >
                          <input
                            type="radio"
                            name={`q${i}`}
                            checked={chosen}
                            disabled={!!results}
                            onChange={() => answer(i, option)}
                            className="mt-1 accent-teal-700"
                          />
                          <Markdown text={option} />
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <textarea
                    value={answers[i]}
                    onChange={(e) => answer(i, e.target.value)}
                    disabled={!!results}
                    rows={3}
                    placeholder="Write your answer…"
                    className={field}
                  />
                )}

                {result && (
                  <div className="mt-4 space-y-2 rounded-xl bg-stone-50 p-4 text-sm">
                    {q.kind === "short" && (
                      <div>
                        <p className="font-medium text-stone-900">{result.feedback}</p>
                        <div className="mt-2 text-stone-600">
                          <span className="font-medium text-stone-800">A good answer: </span>
                          <Markdown inline text={result.answer} />
                        </div>
                      </div>
                    )}
                    <div className="text-stone-600">
                      <Markdown inline text={result.explanation} />{" "}
                      <Cites ids={result.cites} citations={results.citations} />
                    </div>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {!results && (
        <div className="mt-6 flex items-center gap-3">
          <Button onClick={submit} busy={grading}>
            {grading ? "Marking…" : "Submit answers"}
          </Button>
          {grading && <Spinner label="Short answers are marked by AI, give it a few seconds" />}
        </div>
      )}
      <div className="mt-3">
        <ErrorNote>{error}</ErrorNote>
      </div>
    </div>
  );
}

function Score({ value }: { value: number }) {
  if (value >= 1) {
    return (
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700">
        <Check size={15} />
      </span>
    );
  }
  if (value > 0) {
    return <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">½</span>;
  }
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-red-100 text-red-700">
      <X size={15} />
    </span>
  );
}
