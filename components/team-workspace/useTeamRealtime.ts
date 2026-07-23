"use client";

import { useEffect, useRef } from "react";
import { getTeamChatSupabaseBrowser } from "@/lib/teamChat/supabaseBrowser";

export function useTeamRealtime(tables: string[], reload: () => void) {
  const reloadRef = useRef(reload);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  reloadRef.current = reload;
  useEffect(() => {
    const supabase = getTeamChatSupabaseBrowser();
    let channel = supabase.channel(`team-workspace-${tables.join("-")}-${Math.random().toString(36).slice(2)}`);
    const scheduleReload = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => reloadRef.current(), 120);
    };
    for (const table of tables) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, scheduleReload);
    }
    channel.subscribe();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(channel);
    };
  }, [tables.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
}
