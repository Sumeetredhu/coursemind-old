"use client";

import type { User } from "@supabase/supabase-js";
import { LogOut } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { supabase } from "@/lib/supabase";

export function Logo() {
  return (
    <Link href="/" className="font-semibold tracking-tight text-stone-900">
      CourseMind
    </Link>
  );
}

export function Header({ user, children }: { user: User | null; children?: ReactNode }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-stone-200 bg-white px-4 sm:px-6">
      <Logo />
      <div className="min-w-0 flex-1">{children}</div>
      {user && (
        <div className="flex items-center gap-3 text-sm text-stone-500">
          <span className="hidden truncate sm:inline">{user.email}</span>
          <button
            onClick={() => supabase.auth.signOut()}
            className="rounded-md p-1.5 hover:bg-stone-100 hover:text-stone-900"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      )}
    </header>
  );
}
