import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompetitionMode, PublicLeaderboardPayload } from "@/lib/types";
import { SummitTimerPage } from "./summit-timer-page";

describe("SummitTimerPage", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(() => new Promise(() => undefined));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows a neutral loading timer instead of a fake starting value", () => {
    render(<SummitTimerPage mode="qualifier" />);

    expect(screen.getByRole("img", { name: "Solana Summit Germany" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Jupiter" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Trading Cup" })).toBeInTheDocument();
    const timer = screen.getByRole("timer", { name: "Qualifier timer" });
    expect(screen.getByText("Qualifier time left")).toBeInTheDocument();
    expect(timer).toHaveClass("summit-outline-cta");
    expect(timer).toHaveTextContent("--:--");
    expect(screen.getByText("Loading round clock")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open qualifier leaderboard" })).toHaveAttribute(
      "href",
      "/qualifier",
    );
    expect(screen.getByText("tradingcup.live/qualifier")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/leaderboard?mode=qualifier", {
      cache: "no-store",
    });
  });

  it("smoothly counts down a live qualifier timer from public state", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T12:00:00.000Z"));
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse(
        createPayload("qualifier", {
          durationSeconds: 3600,
          remainingSeconds: 3600,
          startedAt: "2026-06-13T12:00:00.000Z",
          status: "live",
        }),
      )),
    );

    render(<SummitTimerPage mode="qualifier" />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText("60:00")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(4_000);
      await Promise.resolve();
    });

    expect(screen.getByRole("timer", { name: "Qualifier timer" })).toHaveTextContent("59:56");
    expect(screen.getByText("Round live")).toBeInTheDocument();
  });

  it("renders locked final state and only links to the public final page", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse(
        createPayload("final", {
          durationSeconds: 1800,
          remainingSeconds: 0,
          startedAt: "2026-06-13T12:00:00.000Z",
          status: "locked",
        }),
      )),
    );

    render(<SummitTimerPage mode="final" />);

    expect(await screen.findByText("00:00")).toBeInTheDocument();
    expect(screen.getByRole("timer", { name: "Final timer" })).toHaveClass("summit-outline-cta");
    expect(screen.getByText("Final time left")).toBeInTheDocument();
    expect(screen.getByText("Standings locked")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open final leaderboard" })).toHaveAttribute(
      "href",
      "/final",
    );
    expect(screen.getByText("tradingcup.live/final")).toBeInTheDocument();
    expect(screen.queryByText("@secret")).not.toBeInTheDocument();
  });
});

function jsonResponse(payload: PublicLeaderboardPayload): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function createPayload(
  mode: CompetitionMode,
  overrides: Pick<
    PublicLeaderboardPayload["state"],
    "durationSeconds" | "remainingSeconds" | "startedAt" | "status"
  >,
): PublicLeaderboardPayload {
  return {
    state: {
      activeMode: mode,
      dataSource: "jupiter-sdk",
      liveDataStatus: {
        qualifier: "idle",
        final: "idle",
      },
      liveDataUpdatedAt: {
        qualifier: null,
        final: null,
      },
      lockedStandings: {
        qualifier: null,
        final: null,
      },
      scenario: "steady",
      selectedFinalistIds: [],
      updatedAt: "2026-06-13T12:00:00.000Z",
      ...overrides,
    },
    traders: [
      {
        id: "secret-trader",
        avatarUrl: "/avatars/mert.jpg",
        displayName: "Secret Trader",
        equity: 100,
        gapToLeader: 0,
        lastUpdated: "2026-06-13T12:00:00.000Z",
        mode,
        pnlPercent: 0,
        pnlUsd: 0,
        rank: 1,
        startingBalance: mode === "final" ? 1000 : 100,
        startingEquity: mode === "final" ? 1000 : 100,
        status: "active",
        volume: 0,
        xHandle: "@secret",
      },
    ],
  };
}
