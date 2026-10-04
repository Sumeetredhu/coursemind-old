"use client";

import { ArrowUpRight, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Header } from "@/components/Header";
import { Button, Empty, ErrorNote, Spinner, field } from "@/components/ui";
import { api } from "@/lib/api";
import { plural } from "@/lib/format";
import type { CourseListItem } from "@/lib/types";
import { useUser } from "@/lib/useUser";

export default function Home() {
  const router = useRouter();
  const user = useUser();
  const [courses, setCourses] = useState<CourseListItem[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    api<CourseListItem[]>("/courses")
      .then(setCourses)
      .catch((e) => setError(e.message));
  }, [user]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const course = await api<{ id: string }>("/courses", { body: { name } });
      router.push(`/courses/${course.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <Header user={user} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Your courses</h1>
        <p className="mt-1 text-sm text-stone-500">
          One course per subject. Add its lectures, slides and past papers, then study from them.
        </p>

        <form onSubmit={create} className="mt-6 flex max-w-lg gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Course name, like Operating Systems"
            className={field}
          />
          <Button type="submit" busy={busy} disabled={!name.trim()}>
            <Plus size={16} />
            Add
          </Button>
        </form>
        <div className="mt-3 max-w-lg">
          <ErrorNote>{error}</ErrorNote>
        </div>

        <div className="mt-8">
          {!courses && !error && <Spinner label="Loading your courses…" />}
          {courses?.length === 0 && (
            <Empty title="No courses yet">Add your first course above to get started.</Empty>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses?.map((course) => (
              <Link
                key={course.id}
                href={`/courses/${course.id}`}
                className="group rounded-2xl border border-stone-200 bg-white p-5 transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold text-stone-900">{course.name}</h2>
                  <ArrowUpRight size={18} className="text-stone-300 group-hover:text-teal-700" />
                </div>
                <p className="mt-6 text-sm text-stone-500">
                  {plural(course.sources, "source")}
                  {course.notes_status === "ready" && " · notes ready"}
                  {(course.notes_status === "queued" || course.notes_status === "building") && " · making notes…"}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
