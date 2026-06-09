"use client";

import { useEffect, useMemo, useState } from "react";
import { deriveTimerStatus, formatTimer } from "@/lib/leaderboard";
import type { PublicLeaderboardPayload } from "@/lib/types";

export function getNextLeaderboardTimerDelayMs(nowMs: number, startedAtMs: number): number {
  const elapsedMs = Math.max(0, nowMs - startedAtMs);
  const msIntoSecond = elapsedMs % 1_000;

  return msIntoSecond === 0 ? 1_000 : 1_000 - msIntoSecond;
}

export function useSmoothLeaderboardTimer(
  payload: PublicLeaderboardPayload | null,
  fallbackTimer: string,
): string {
  const [now, setNow] = useState(() => new Date());
  const status = payload?.state.status;
  const startedAt = payload?.state.startedAt;

  useEffect(() => {
    if (status !== "live" || !startedAt) return;

    let active = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const startedAtMs = new Date(startedAt).getTime();

    const tick = () => {
      if (!active) return;

      const nextNow = new Date();
      setNow(nextNow);
      timeout = setTimeout(
        tick,
        getNextLeaderboardTimerDelayMs(nextNow.getTime(), startedAtMs),
      );
    };

    tick();

    return () => {
      active = false;
      if (timeout) clearTimeout(timeout);
    };
  }, [startedAt, status]);

  return useMemo(() => {
    if (!payload) return fallbackTimer;
    if (payload.state.status !== "live" || !payload.state.startedAt) {
      return formatTimer(payload.state.remainingSeconds);
    }

    return formatTimer(
      deriveTimerStatus({
        status: payload.state.status,
        startedAt: payload.state.startedAt,
        durationSeconds: payload.state.durationSeconds,
        now,
      }).remainingSeconds,
    );
  }, [fallbackTimer, now, payload]);
}
