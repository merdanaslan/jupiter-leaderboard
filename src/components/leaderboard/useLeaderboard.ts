"use client";

import { useEffect, useState } from "react";
import type { CompetitionMode, PublicLeaderboardPayload } from "@/lib/types";

interface LeaderboardState {
  data: PublicLeaderboardPayload | null;
  isLoading: boolean;
  error: string | null;
}

export function useLeaderboard(mode: CompetitionMode, intervalMs = 1800): LeaderboardState {
  const [state, setState] = useState<LeaderboardState>({
    data: null,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    let active = true;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      try {
        const response = await fetch(`/api/leaderboard?mode=${mode}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Unable to load leaderboard");
        const data = (await response.json()) as PublicLeaderboardPayload;
        if (!active) return;
        setState({ data, isLoading: false, error: null });
      } catch (error) {
        if (!active) return;
        setState((current) => ({
          ...current,
          isLoading: false,
          error: error instanceof Error ? error.message : "Unable to load leaderboard",
        }));
      } finally {
        if (active) timeout = setTimeout(load, intervalMs);
      }
    }

    void load();

    return () => {
      active = false;
      if (timeout) clearTimeout(timeout);
    };
  }, [intervalMs, mode]);

  return state;
}
