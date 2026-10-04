"use client";

import type { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export function useUser() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setUser(data.session.user);
      else router.replace("/login");
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setUser(session.user);
      else router.replace("/login");
    });
    return () => data.subscription.unsubscribe();
  }, [router]);

  return user;
}
