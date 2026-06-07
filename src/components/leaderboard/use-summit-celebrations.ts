"use client";

import { useEffect, useRef } from "react";
import type confetti from "canvas-confetti";
import {
  getFinalCelebrationEvent,
  getQualifierCelebrationEvent,
  isCelebrationCooldownReady,
} from "@/lib/summit-celebration-events";
import { getConfettiOriginFromRect } from "@/lib/summit-confetti-geometry";
import type { ConfettiOrigin } from "@/lib/summit-confetti-geometry";
import type { CompetitionMode, PublicLeaderboardPayload, PublicTraderScore } from "@/lib/types";

const POSITION_CHANGE_FIRE_COOLDOWN_MS = 3_000;
const SIDE_CANNON_DURATION_MS = 10_000;
const SUMMIT_CONFETTI_COLORS = ["#14f195", "#9945ff", "#5ad7ff", "#f7d154", "#ffffff"];

type SummitConfettiRuntime = {
  fire: confetti.CreateTypes;
  shapeFromText: typeof confetti.shapeFromText;
};

let summitConfettiCanvas: HTMLCanvasElement | null = null;
let summitConfettiRuntime: SummitConfettiRuntime | null = null;

export function useSummitCelebrations({
  enabled,
  mode,
  payload,
}: {
  enabled: boolean;
  mode: CompetitionMode;
  payload: PublicLeaderboardPayload;
}) {
  const previousStatusRef = useRef(payload.state.status);
  const previousPositionTradersRef = useRef<PublicTraderScore[] | null>(null);
  const lastPositionBurstAtRef = useRef<number | null>(null);
  const firedLockedAtRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      previousStatusRef.current = payload.state.status;
      previousPositionTradersRef.current = null;
      lastPositionBurstAtRef.current = null;
      firedLockedAtRef.current = null;
      return;
    }

    const previousStatus = previousStatusRef.current;

    if (
      previousStatus === "live" &&
      payload.state.status === "locked" &&
      firedLockedAtRef.current !== payload.state.updatedAt
    ) {
      firedLockedAtRef.current = payload.state.updatedAt;
      void runSideCannons();
    }

    previousStatusRef.current = payload.state.status;
  }, [enabled, payload.state.status, payload.state.updatedAt]);

  useEffect(() => {
    if (!enabled || payload.state.status !== "live") {
      previousPositionTradersRef.current = payload.traders;
      return;
    }

    const previousTraders = previousPositionTradersRef.current;

    if (previousTraders) {
      const event =
        mode === "qualifier"
          ? getQualifierCelebrationEvent(previousTraders, payload.traders)
          : getFinalCelebrationEvent(previousTraders, payload.traders);
      const now = Date.now();

      if (
        event &&
        isCelebrationCooldownReady({
          lastTriggeredAt: lastPositionBurstAtRef.current,
          now,
          cooldownMs: POSITION_CHANGE_FIRE_COOLDOWN_MS,
        })
      ) {
        lastPositionBurstAtRef.current = now;
        void runFireEmojiBurst(getTraderRowFireOrigins(event.traderIds));
      }
    }

    previousPositionTradersRef.current = payload.traders;
  }, [enabled, mode, payload.state.status, payload.state.updatedAt, payload.traders]);
}

async function runSideCannons(durationMs = SIDE_CANNON_DURATION_MS) {
  const confettiRuntime = await getConfetti();
  if (!confettiRuntime) return;

  const animationEnd = Date.now() + durationMs;

  const frame = () => {
    confettiRuntime.fire({
      particleCount: 1,
      angle: 60,
      spread: 58,
      startVelocity: 48,
      decay: 0.92,
      scalar: 0.9,
      colors: SUMMIT_CONFETTI_COLORS,
      origin: { x: 0, y: 0.66 },
      disableForReducedMotion: true,
    });

    confettiRuntime.fire({
      particleCount: 1,
      angle: 120,
      spread: 58,
      startVelocity: 48,
      decay: 0.92,
      scalar: 0.9,
      colors: SUMMIT_CONFETTI_COLORS,
      origin: { x: 1, y: 0.66 },
      disableForReducedMotion: true,
    });

    if (Date.now() < animationEnd) {
      window.requestAnimationFrame(frame);
    }
  };

  frame();
}

async function runFireEmojiBurst(origins: ConfettiOrigin[]) {
  const confettiRuntime = await getConfetti();
  if (!confettiRuntime) return;

  const fireShape = confettiRuntime.shapeFromText({ text: "🔥", scalar: 2 });
  const burstOrigins = origins.length > 0 ? origins : [{ x: 0.5, y: 0.42 }];

  for (const origin of burstOrigins) {
    confettiRuntime.fire({
      particleCount: 34,
      spread: 360,
      startVelocity: 46,
      decay: 0.9,
      scalar: 1.5,
      ticks: 170,
      gravity: 0.85,
      shapes: [fireShape],
      origin,
      disableForReducedMotion: true,
    });

    confettiRuntime.fire({
      particleCount: 16,
      spread: 110,
      startVelocity: 58,
      decay: 0.88,
      scalar: 1.8,
      ticks: 155,
      gravity: 0.95,
      shapes: [fireShape],
      origin,
      disableForReducedMotion: true,
    });
  }
}

function getTraderRowFireOrigins(traderIds: string[]): ConfettiOrigin[] {
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
  };

  return traderIds
    .slice(0, 4)
    .map((traderId) => findSummitTraderRow(traderId)?.getBoundingClientRect())
    .filter((rect): rect is DOMRect => Boolean(rect))
    .map((rect) => getConfettiOriginFromRect(rect, viewport));
}

function findSummitTraderRow(traderId: string): HTMLElement | null {
  const rows = document.querySelectorAll<HTMLElement>("[data-summit-trader-id]");

  for (const row of rows) {
    if (row.dataset.summitTraderId === traderId) return row;
  }

  return null;
}

async function getConfetti(): Promise<SummitConfettiRuntime | null> {
  if (shouldSkipConfetti()) return null;
  if (summitConfettiRuntime) return summitConfettiRuntime;

  try {
    const confettiModule = await import("canvas-confetti");
    const canvas = getOrCreateConfettiCanvas();
    summitConfettiRuntime = {
      fire: confettiModule.default.create(canvas, {
        resize: true,
        useWorker: true,
        disableForReducedMotion: true,
      }),
      shapeFromText: confettiModule.default.shapeFromText,
    };

    return summitConfettiRuntime;
  } catch {
    return null;
  }
}

function getOrCreateConfettiCanvas(): HTMLCanvasElement {
  if (summitConfettiCanvas?.isConnected) return summitConfettiCanvas;

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.dataset.summitConfetti = "true";
  canvas.style.position = "fixed";
  canvas.style.inset = "0";
  canvas.style.width = "100vw";
  canvas.style.height = "100vh";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "100";
  canvas.style.contain = "strict";
  document.body.appendChild(canvas);
  summitConfettiCanvas = canvas;

  return canvas;
}

function shouldSkipConfetti(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return true;
  if (window.navigator.userAgent.toLowerCase().includes("jsdom")) return true;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return true;

  try {
    const canvas = document.createElement("canvas");
    return !canvas.getContext("2d");
  } catch {
    return true;
  }
}
