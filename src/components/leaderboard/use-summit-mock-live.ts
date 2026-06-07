"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  createSummitMockLeaderboardPayload,
} from "@/lib/summit-live-leaderboard";
import type { CompetitionMode, PublicLeaderboardPayload } from "@/lib/types";

const LIVE_QUERY_KEYS = new Set(["live", "mock-live"]);

export function useSummitMockLiveFlag(explicitMockLive = false): boolean {
  const [queryMockLive, setQueryMockLive] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mockValue = params.get("mock");
    const liveValue = params.get("live");

    setQueryMockLive(
      (mockValue !== null && LIVE_QUERY_KEYS.has(mockValue)) ||
        liveValue === "mock" ||
        params.has("mockLive"),
    );
  }, []);

  return explicitMockLive || queryMockLive;
}

export function useSummitMockDurationSeconds(explicitDurationSeconds?: number): number | undefined {
  const [queryDurationSeconds, setQueryDurationSeconds] = useState<number | undefined>();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const durationValue =
      params.get("mockDuration") ?? params.get("duration") ?? params.get("demoDuration");
    const parsedDuration = durationValue ? Number(durationValue) : undefined;

    setQueryDurationSeconds(
      typeof parsedDuration === "number" && Number.isFinite(parsedDuration) && parsedDuration > 0
        ? Math.floor(parsedDuration)
        : undefined,
    );
  }, []);

  return explicitDurationSeconds ?? queryDurationSeconds;
}

export function useSummitMockLeaderboardPayload(
  mode: CompetitionMode,
  enabled: boolean,
  options: { durationSeconds?: number } = {},
): PublicLeaderboardPayload {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setTick(0);

    if (!enabled) return undefined;

    const interval = window.setInterval(() => {
      setTick((currentTick) => currentTick + 1);
    }, 2_000);

    return () => window.clearInterval(interval);
  }, [enabled, mode]);

  return useMemo(
    () => createSummitMockLeaderboardPayload(mode, enabled ? tick : 0, "live", options),
    [enabled, mode, options, tick],
  );
}

export function useFlipListMovement(
  orderedIds: string[],
  enabled: boolean,
): (id: string) => (node: HTMLElement | null) => void {
  const nodesRef = useRef(new Map<string, HTMLElement>());
  const previousRectsRef = useRef(new Map<string, DOMRect>());
  const orderKey = orderedIds.join("|");

  useLayoutEffect(() => {
    const nextRects = new Map<string, DOMRect>();

    for (const id of orderedIds) {
      const node = nodesRef.current.get(id);
      if (node) nextRects.set(id, node.getBoundingClientRect());
    }

    if (
      enabled &&
      previousRectsRef.current.size > 0 &&
      !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      for (const [id, nextRect] of nextRects) {
        const previousRect = previousRectsRef.current.get(id);
        const node = nodesRef.current.get(id);
        const animate = node?.animate?.bind(node);

        if (!previousRect || !animate) continue;

        const deltaX = previousRect.left - nextRect.left;
        const deltaY = previousRect.top - nextRect.top;

        if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) continue;

        animate(
          [
            { transform: `translate(${deltaX}px, ${deltaY}px)` },
            { transform: "translate(0, 0)" },
          ],
          {
            duration: 520,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          },
        );
      }
    }

    previousRectsRef.current = nextRects;
  }, [enabled, orderKey, orderedIds]);

  return useCallback(
    (id: string) => (node: HTMLElement | null) => {
      if (node) {
        nodesRef.current.set(id, node);
        return;
      }

      nodesRef.current.delete(id);
    },
    [],
  );
}
