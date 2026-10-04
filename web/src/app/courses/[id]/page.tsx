"use client";

import { Files, Layers, ListChecks, MessageCircle, Mic, NotebookText, ScrollText } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AskTab } from "@/components/course/AskTab";
import { FlashcardsTab } from "@/components/course/FlashcardsTab";
import { NotesTab } from "@/components/course/NotesTab";
import { PapersTab } from "@/components/course/PapersTab";
import { QuizTab } from "@/components/course/QuizTab";
import { SourcesTab } from "@/components/course/SourcesTab";
import { VivaTab } from "@/components/course/VivaTab";
import { Header } from "@/components/Header";
import { ErrorNote, Spinner } from "@/components/ui";
import { SourcePanel, ViewerProvider } from "@/components/Viewer";
import { api } from "@/lib/api";
import type { Course } from "@/lib/types";
import { useUser } from "@/lib/useUser";

const TABS = [
  { id: "sources", label: "Sources", icon: Files },
  { id: "notes", label: "Notes", icon: NotebookText },
  { id: "ask", label: "Ask", icon: MessageCircle },
  { id: "cards", label: "Flashcards", icon: Layers },
  { id: "papers", label: "Past papers", icon: ScrollText },
  { id: "quiz", label: "Quiz", icon: ListChecks },
  { id: "viva", label: "Viva", icon: Mic },
] as const;

type Tab = (typeof TABS)[number]["id"];

export default function CoursePage() {
  const { id } = useParams<{ id: string }>();
  const user = useUser();
  const [course, setCourse] = useState<Course | null>(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<Tab | null>(null);

  const load = useCallback(
    () =>
      api<Course>(`/courses/${id}`)
        .then((c) => {
          setCourse(c);
          setError("");
        })
        .catch((e) => setError(e.message)),
    [id],
  );

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const working =
    !!course &&
    (course.sources.some((s) => s.status === "queued" || s.status === "processing") ||
      course.notes_status === "queued" ||
      course.notes_status === "building");

  useEffect(() => {
    if (!working) return;
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [working, load]);

  const tab: Tab = picked ?? (course?.notes_status === "ready" ? "notes" : "sources");

  return (
    <ViewerProvider>
      <div className="flex h-screen flex-col">
        <Header user={user}>
          <div className="flex items-center gap-2 text-sm">
            <Link href="/" className="text-stone-400 hover:text-stone-700">
              Courses
            </Link>
            <span className="text-stone-300">/</span>
            <span className="truncate font-medium text-stone-800">{course?.name}</span>
          </div>
        </Header>

        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-y-auto">
            <nav className="sticky top-0 z-10 border-b border-stone-200 bg-[#fafaf9]/90 backdrop-blur">
              <div className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-4 sm:px-6">
                {TABS.map(({ id: tabId, label, icon: Icon }) => (
                  <button
                    key={tabId}
                    onClick={() => {
                      setPicked(tabId);
                      load();
                    }}
                    className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                      tab === tabId
                        ? "border-teal-700 text-teal-800"
                        : "border-transparent text-stone-500 hover:text-stone-800"
                    }`}
                  >
                    <Icon size={15} />
                    {label}
                  </button>
                ))}
              </div>
            </nav>

            <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
              <ErrorNote>{error}</ErrorNote>
              {!course && !error && <Spinner label="Loading course…" />}
              {course && tab === "sources" && <SourcesTab course={course} reload={load} onNext={() => setPicked("notes")} />}
              {course && tab === "notes" && <NotesTab course={course} reload={load} />}
              {course && tab === "ask" && <AskTab course={course} />}
              {course && tab === "cards" && <FlashcardsTab course={course} />}
              {course && tab === "papers" && <PapersTab course={course} reload={load} />}
              {course && tab === "quiz" && <QuizTab course={course} />}
              {course && tab === "viva" && <VivaTab course={course} />}
            </div>
          </main>
          <SourcePanel />
        </div>
      </div>
    </ViewerProvider>
  );
}
