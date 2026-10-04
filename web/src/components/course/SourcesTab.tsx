"use client";

import { FileText, Play, RotateCw, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { sourceMeta, wholeSource } from "@/lib/format";
import type { Course, Source } from "@/lib/types";
import { Button, Empty, ErrorNote, StatusBadge, field } from "../ui";
import { useViewer } from "../Viewer";

type Props = { course: Course; reload: () => void; onNext: () => void };

export function SourcesTab({ course, reload, onNext }: Props) {
  const router = useRouter();
  const [link, setLink] = useState("");
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const picker = useRef<HTMLInputElement>(null);

  const materials = course.sources.filter((s) => s.role === "material");
  const allReady = materials.length > 0 && materials.every((s) => s.status === "ready" || s.status === "failed");

  async function addVideo(e: FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError("");
    try {
      await api(`/courses/${course.id}/youtube`, { body: { url: link } });
      setLink("");
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function upload(files: FileList | null) {
    setError("");
    for (const file of Array.from(files ?? [])) {
      setUploading((names) => [...names, file.name]);
      const form = new FormData();
      form.append("file", file);
      form.append("role", "material");
      try {
        await api(`/courses/${course.id}/pdf`, { form });
      } catch (e) {
        setError(`${file.name}: ${(e as Error).message}`);
      } finally {
        setUploading((names) => names.filter((n) => n !== file.name));
      }
    }
    reload();
  }

  async function deleteCourse() {
    if (!confirm(`Delete "${course.name}" and everything in it? This can't be undone.`)) return;
    await api(`/courses/${course.id}`, { method: "DELETE" });
    router.push("/");
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Sources</h1>
      <p className="mt-1 max-w-2xl text-sm text-stone-500">
        Add what this course is taught from. Each source gets read and split into small pieces, so every note can
        point back to the exact page or minute it came from.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <form onSubmit={addVideo} className="rounded-2xl border border-stone-200 bg-white p-5">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Play size={16} className="text-red-600" />
            YouTube lecture
          </p>
          <p className="mt-1 text-xs text-stone-500">Public videos work. Captions make it faster.</p>
          <div className="mt-4 flex gap-2">
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://youtube.com/watch?v=…"
              className={field}
            />
            <Button type="submit" busy={adding} disabled={!link.trim()}>
              Add
            </Button>
          </div>
        </form>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            upload(e.dataTransfer.files);
          }}
          onClick={() => picker.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-5 text-center transition-colors ${
            dragging ? "border-teal-600 bg-teal-50" : "border-stone-300 bg-white hover:border-stone-400"
          }`}
        >
          <Upload size={20} className="text-stone-400" />
          <p className="mt-2 text-sm font-semibold">Drop slides or notes here</p>
          <p className="mt-1 text-xs text-stone-500">PDF only, up to 40 MB. Scanned notes are fine too.</p>
          {uploading.length > 0 && <p className="mt-2 text-xs text-teal-700">Uploading {uploading.join(", ")}…</p>}
          <input
            ref={picker}
            type="file"
            accept="application/pdf"
            multiple
            hidden
            onChange={(e) => {
              upload(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <div className="mt-4">
        <ErrorNote>{error}</ErrorNote>
      </div>

      <div className="mt-6">
        {materials.length === 0 ? (
          <Empty title="Nothing here yet">
            Start with a lecture video or a set of slides. Past exam papers go in the Past papers tab.
          </Empty>
        ) : (
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
            {materials.map((source) => (
              <SourceRow key={source.id} source={source} reload={reload} />
            ))}
          </ul>
        )}
      </div>

      {allReady && course.notes_status === "none" && (
        <div className="mt-6 flex items-center justify-between gap-4 rounded-2xl bg-teal-700 px-5 py-4 text-white">
          <p className="text-sm">Your sources are ready. Next, turn them into notes and flashcards.</p>
          <Button variant="secondary" onClick={onNext}>
            Go to notes
          </Button>
        </div>
      )}

      <div className="mt-16 border-t border-stone-200 pt-6">
        <Button variant="danger" onClick={deleteCourse}>
          <Trash2 size={15} />
          Delete this course
        </Button>
      </div>
    </div>
  );
}

function SourceRow({ source, reload }: { source: Source; reload: () => void }) {
  const { open } = useViewer();
  const Icon = source.kind === "youtube" ? Play : FileText;

  async function retry() {
    await api(`/sources/${source.id}/retry`, { method: "POST" });
    reload();
  }

  async function remove() {
    if (!confirm(`Remove "${source.title}"? Notes made from it will lose those links.`)) return;
    await api(`/sources/${source.id}`, { method: "DELETE" });
    reload();
  }

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-lg ${
          source.kind === "youtube" ? "bg-red-50 text-red-600" : "bg-sky-50 text-sky-700"
        }`}
      >
        <Icon size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <button
          onClick={() => open(wholeSource(source))}
          disabled={source.status !== "ready"}
          className="block max-w-full truncate text-left text-sm font-medium text-stone-900 enabled:hover:text-teal-700"
        >
          {source.title}
        </button>
        <p className="truncate text-xs text-stone-500">
          {sourceMeta(source)}
          {source.error && <span className="text-red-600"> · {source.error}</span>}
        </p>
      </div>
      <StatusBadge status={source.status} />
      {source.status === "failed" && (
        <button onClick={retry} className="rounded-md p-1.5 text-stone-500 hover:bg-stone-100" title="Try again">
          <RotateCw size={15} />
        </button>
      )}
      <button onClick={remove} className="rounded-md p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600" title="Remove">
        <Trash2 size={15} />
      </button>
    </li>
  );
}
