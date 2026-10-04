export type Citation = {
  id: string;
  source_id: string;
  title: string;
  kind: "pdf" | "youtube";
  page: number | null;
  bbox: number[] | null;
  start: number | null;
  end: number | null;
  video_id: string | null;
  label: string;
  snippet: string;
};

export type SourceStatus = "queued" | "processing" | "ready" | "failed";

export type Source = {
  id: string;
  kind: "pdf" | "youtube";
  role: "material" | "paper";
  title: string;
  url: string | null;
  video_id: string | null;
  year: number | null;
  page_count: number | null;
  duration_sec: number | null;
  status: SourceStatus;
  error: string | null;
  created_at: string;
};

export type NotesStatus = "none" | "queued" | "building" | "ready" | "failed";

export type TopicSummary = {
  id: string;
  title: string;
  summary: string;
  position: number;
  has_notes: boolean;
};

export type Course = {
  id: string;
  name: string;
  notes_status: NotesStatus;
  notes_error: string | null;
  sources: Source[];
  topics: TopicSummary[];
};

export type CourseListItem = {
  id: string;
  name: string;
  created_at: string;
  notes_status: NotesStatus;
  sources: number;
  ready: number;
};

export type NotePoint = { text: string; cites: string[] };

export type TopicNotes = {
  overview: string;
  sections: { heading: string; points: NotePoint[] }[];
  terms: { term: string; meaning: string; cites: string[] }[];
};

export type NotesResponse = {
  status: NotesStatus;
  error: string | null;
  topics: { id: string; title: string; summary: string; position: number; notes: TopicNotes | null }[];
  citations: Record<string, Citation>;
};

export type Card = {
  id: string;
  front: string;
  back: string;
  cites: string[];
  due_at: string;
  reps: number;
  topic_id: string | null;
  topic: string | null;
};

export type CardsResponse = {
  cards: Card[];
  total: number;
  due: number;
  citations: Record<string, Citation>;
};

export type PaperQuestion = {
  id: string;
  topic_id: string | null;
  source_id: string;
  year: number | null;
  number: string;
  text: string;
  marks: number | null;
  page: number | null;
  paper: string;
};

export type PapersResponse = {
  papers: {
    id: string;
    title: string;
    year: number | null;
    status: SourceStatus;
    error: string | null;
    page_count: number | null;
  }[];
  topics: { id: string; title: string; position: number; questions: number; years: number; marks: number }[];
  questions: PaperQuestion[];
  years: number[];
};

export type QuizQuestion = { kind: "mcq" | "short"; question: string; options: string[] };

export type Quiz = { id: string; questions: QuizQuestion[] };

export type QuizResult = {
  score: number;
  feedback: string;
  answer: string;
  explanation: string;
  cites: string[];
  given: string;
};

export type QuizResults = { score: number; results: QuizResult[]; citations: Record<string, Citation> };

export type VivaTurn = { question: string; answer?: string; feedback?: string; score?: number };

export type VivaReport = {
  score: number;
  summary: string;
  strengths: string[];
  revise: { text: string; cites: string[] }[];
};

export type Viva = {
  id: string;
  topic: string;
  total: number;
  turns: VivaTurn[];
  report: VivaReport | null;
  sources: Citation[];
};
