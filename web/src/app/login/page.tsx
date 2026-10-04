"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Logo } from "@/components/Header";
import { Button, ErrorNote, field } from "@/components/ui";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/");
    });
  }, [router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNote("");
    const { data, error } =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setBusy(false);

    if (error) return setError(error.message);
    if (data.session) return router.replace("/");
    setNote("Account made. Check your email to confirm it, then sign in.");
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <Logo />
        <h1 className="mt-8 text-2xl font-semibold tracking-tight">
          {mode === "in" ? "Welcome back" : "Make your account"}
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Turn your lectures, slides and past papers into notes you can actually trust.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={field}
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={field}
          />
          <ErrorNote>{error}</ErrorNote>
          {note && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{note}</p>}
          <Button type="submit" busy={busy} className="w-full">
            {mode === "in" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-stone-500">
          {mode === "in" ? "New here? " : "Already have an account? "}
          <button
            onClick={() => {
              setMode(mode === "in" ? "up" : "in");
              setError("");
            }}
            className="font-medium text-teal-700 hover:underline"
          >
            {mode === "in" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </div>
    </main>
  );
}
