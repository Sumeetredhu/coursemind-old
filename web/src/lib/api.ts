import { supabase } from "./supabase";
import type { Citation } from "./types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function failure(res: Response): Promise<Error> {
  if (res.status === 401) await supabase.auth.signOut();
  const data = await res.json().catch(() => ({}));
  return new Error(typeof data.detail === "string" ? data.detail : `Something went wrong (${res.status})`);
}

type Options = { method?: string; body?: unknown; form?: FormData };

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const headers = await authHeader();
  let body: BodyInit | undefined;
  if (options.form) {
    body = options.form;
  } else if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers["Content-Type"] = "application/json";
  }

  const res = await reach(`${API_URL}/api${path}`, {
    method: options.method ?? (body ? "POST" : "GET"),
    headers,
    body,
  });
  if (!res.ok) throw await failure(res);
  return res.json();
}

async function reach(url: string, init: RequestInit) {
  try {
    return await fetch(url, init);
  } catch {
    throw new Error("Can't reach the CourseMind server. Is the backend running?");
  }
}

const pdfUrls = new Map<string, Promise<string>>();

export function pdfUrl(sourceId: string): Promise<string> {
  let url = pdfUrls.get(sourceId);
  if (!url) {
    url = (async () => {
      const res = await reach(`${API_URL}/api/sources/${sourceId}/file`, { headers: await authHeader() });
      if (!res.ok) throw await failure(res);
      return URL.createObjectURL(await res.blob());
    })();
    url.catch(() => pdfUrls.delete(sourceId));
    pdfUrls.set(sourceId, url);
  }
  return url;
}

type AskHandlers = {
  onSources: (sources: Citation[]) => void;
  onText: (text: string) => void;
  onError: (message: string) => void;
};

export async function ask(
  courseId: string,
  question: string,
  history: { role: string; text: string }[],
  handlers: AskHandlers,
) {
  const res = await reach(`${API_URL}/api/courses/${courseId}/ask`, {
    method: "POST",
    headers: { ...(await authHeader()), "Content-Type": "application/json" },
    body: JSON.stringify({ question, history }),
  });
  if (!res.ok || !res.body) throw await failure(res);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end = buffer.indexOf("\n\n");
    while (end !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      end = buffer.indexOf("\n\n");

      const name = block.match(/^event: (.*)$/m)?.[1];
      const data = block.match(/^data: (.*)$/m)?.[1];
      if (!name || !data) continue;
      const parsed = JSON.parse(data);
      if (name === "sources") handlers.onSources(parsed);
      if (name === "text") handlers.onText(parsed.text);
      if (name === "error") handlers.onError(parsed.message);
    }
  }
}
