"use client";

import { Check, Mic, Square } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Citation, Course, Viva } from "@/lib/types";
import { Cites } from "../Cite";
import { Markdown } from "../Markdown";
import { Button, Empty, ErrorNote, field } from "../ui";
import { TopicSelect } from "./TopicSelect";

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechWindow = { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };

export function VivaTab({ course }: { course: Course }) {
  const [topic, setTopic] = useState("");
  const [viva, setViva] = useState<Viva | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);

  async function start() {
    setBusy(true);
    setError("");
    try {
      setViva(await api<Viva>(`/courses/${course.id}/viva`, { body: { topic_id: topic } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!viva || !answer.trim()) return;
    recognition.current?.stop();
    setBusy(true);
    setError("");
    try {
      setViva(await api<Viva>(`/viva/${viva.id}/answer`, { body: { answer } }));
      setAnswer("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function toggleMic() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const speech = window as unknown as SpeechWindow;
    const Speech = speech.SpeechRecognition ?? speech.webkitSpeechRecognition;
    if (!Speech) {
      setError("Voice typing needs Chrome or Edge. You can still type your answer.");
      return;
    }
    const rec = new Speech();
    rec.lang = "en-IN";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      let heard = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) heard += e.results[i][0].transcript;
      }
      if (heard) setAnswer((a) => `${a}${a && !a.endsWith(" ") ? " " : ""}${heard.trim()}`);
    };
    rec.onend = () => setListening(false);
    recognition.current = rec;
    rec.start();
    setListening(true);
  }

  if (course.topics.length === 0) {
    return (
      <Empty title="Make your notes first">
        The viva asks you questions topic by topic, so it needs your course split into topics. Go to Notes and make
        them first.
      </Empty>
    );
  }

  if (!viva) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Viva</h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-500">
          A short oral exam. You get 5 questions on one topic, they get harder if you do well, and you get feedback
          after every answer. You can type or speak.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl border border-stone-200 bg-white p-4">
          <TopicSelect topics={course.topics} value={topic} onChange={setTopic} />
          <Button onClick={start} busy={busy} disabled={!topic}>
            {busy ? "Getting ready…" : "Start viva"}
          </Button>
        </div>
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      </div>
    );
  }

  const byId: Record<string, Citation> = Object.fromEntries(viva.sources.map((s) => [s.id, s]));
  const waiting = !viva.report && !viva.turns[viva.turns.length - 1]?.answer;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Viva: {viva.topic}</h1>
          <p className="mt-1 text-sm text-stone-500">
            {viva.report ? "Finished" : `Question ${viva.turns.length} of ${viva.total}`}
          </p>
        </div>
        <Button variant="secondary" onClick={() => setViva(null)}>
          New viva
        </Button>
      </div>

      <div className="mt-8 space-y-5">
        {viva.turns.map((turn, i) => (
          <div key={i} className="space-y-3">
            <div className="max-w-[90%] rounded-2xl rounded-tl-md border border-stone-200 bg-white px-4 py-3">
              <p className="text-xs font-medium text-teal-700">Examiner · Q{i + 1}</p>
              <div className="mt-1 text-[15px]">
                <Markdown text={turn.question} />
              </div>
            </div>
            {turn.answer && (
              <div className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-teal-700 px-4 py-2.5 text-sm text-white">
                  {turn.answer}
                </p>
              </div>
            )}
            {turn.feedback && (
              <div className="max-w-[90%] rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-700">
                <Dots score={turn.score ?? 0} />
                <div className="mt-1.5">
                  <Markdown text={turn.feedback} sources={viva.sources} />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {waiting && (
        <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-3">
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={4}
            placeholder="Answer like you would out loud. Explain your thinking."
            className={`${field} border-0 focus:ring-0`}
          />
          <div className="mt-2 flex items-center justify-between">
            <button
              onClick={toggleMic}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                listening ? "bg-red-50 text-red-700" : "text-stone-600 hover:bg-stone-100"
              }`}
            >
              {listening ? <Square size={14} /> : <Mic size={15} />}
              {listening ? "Stop" : "Speak"}
            </button>
            <Button onClick={send} busy={busy} disabled={!answer.trim()}>
              {busy ? "Checking…" : "Answer"}
            </Button>
          </div>
        </div>
      )}
      <div className="mt-3">
        <ErrorNote>{error}</ErrorNote>
      </div>

      {viva.report && (
        <div className="mt-8 rounded-2xl border border-teal-200 bg-white p-6">
          <p className="text-sm text-stone-500">Your viva score</p>
          <p className="text-5xl font-semibold tracking-tight text-teal-700">{viva.report.score}%</p>
          <p className="mt-3 text-stone-700">{viva.report.summary}</p>

          {viva.report.strengths.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold">What you know well</h3>
              <ul className="mt-2 space-y-1.5 text-sm text-stone-700">
                {viva.report.strengths.map((s) => (
                  <li key={s} className="flex gap-2">
                    <Check size={15} className="mt-0.5 shrink-0 text-emerald-600" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {viva.report.revise.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold">Go back over</h3>
              <ul className="mt-2 space-y-2 text-sm text-stone-700">
                {viva.report.revise.map((r) => (
                  <li key={r.text}>
                    {r.text} <Cites ids={r.cites} citations={byId} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Dots({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-1" title={`${score} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={`size-2 rounded-full ${n <= score ? "bg-teal-600" : "bg-stone-300"}`} />
      ))}
      <span className="ml-1.5 text-xs text-stone-500">{score}/5</span>
    </div>
  );
}
