import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SummitFinalPage } from "@/components/leaderboard/summit-final-page";
import FinalPage from "./page";

describe("FinalPage", () => {
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

  it("renders a static Solana Summit final leaderboard without fetching leaderboard data", () => {
    const { container } = render(<FinalPage />);

    expect(
      screen.getByRole("img", { name: "Solana Summit Germany" }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll(".summit-side-pattern-left")).toHaveLength(4);
    expect(container.querySelectorAll(".summit-side-pattern-right")).toHaveLength(4);
    expect(container.querySelectorAll(".summit-side-pattern-segment")).toHaveLength(8);
    expect(container.querySelector(".summit-final-stage")).not.toHaveClass("pb-5");
    expect(
      screen.getByRole("heading", { name: "Trading Cup" }),
    ).toBeInTheDocument();
    expect(container.querySelector(".final-event-lockup")).toHaveClass(
      "max-w-[340px]",
      "md:max-w-none",
    );
    expect(screen.getByText("Powered by")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Jupiter" })).toBeInTheDocument();
    expect(screen.queryByText("LIVE")).not.toBeInTheDocument();
    expect(screen.getByRole("timer", { name: "Final timer" })).toHaveTextContent(
      "Final time left",
    );
    expect(screen.getByRole("timer", { name: "Final timer" })).toHaveTextContent(
      "30:00",
    );

    expect(
      screen.getByRole("heading", { name: "Final Showdown" }),
    ).toBeInTheDocument();
    expect(container.querySelector(".final-board-title")).toHaveClass(
      "justify-center",
      "mt-1",
      "w-full",
      "-translate-y-2",
      "sm:-translate-y-3",
      "lg:mb-7",
    );
    expect(container.querySelector(".final-board-title-label")).not.toHaveClass(
      "qualifier-board-title-glass",
    );
    expect(container.querySelectorAll(".final-board-title-line")).toHaveLength(2);
    expect(container.querySelector(".final-board-title-line-left")).toBeInTheDocument();
    expect(container.querySelector(".final-board-title-line-right")).toBeInTheDocument();
    expect(container.querySelectorAll(".final-title-flame")).toHaveLength(2);
    expect(screen.getByRole("list", { name: "Final leaderboard" })).toBeInTheDocument();
    expect(container.querySelector(".final-board-section")).toHaveClass(
      "flex",
      "justify-center",
      "md:min-h-[calc(100svh-144px)]",
    );
    expect(container.querySelector(".final-leaderboard-rows")).toBeInTheDocument();
    expect(container.querySelector(".final-leaderboard-rows")).toHaveClass(
      "gap-3",
      "sm:gap-4",
      "lg:gap-6",
      "xl:gap-7",
    );
    expect(container.querySelector(".final-board-mobile-header")).toHaveClass(
      "grid",
      "sm:hidden",
    );
    expect(screen.getByText("Trader")).toBeInTheDocument();
    expect(screen.getByText("Trader / X handle")).toBeInTheDocument();
    expect(screen.getByText("Recent activity")).toBeInTheDocument();
    expect(screen.getByText("PnL USD")).toBeInTheDocument();
    expect(screen.getByText("PnL %")).toBeInTheDocument();
    expect(container.querySelector(".final-leader-spotlight")).not.toBeInTheDocument();
    expect(container.querySelector(".final-challenger-stack")).not.toBeInTheDocument();

    const finalistRows = screen.getAllByRole("listitem");
    expect(finalistRows).toHaveLength(4);
    expect(container.querySelectorAll(".final-board-row")).toHaveLength(4);
    expect(container.querySelectorAll("[data-rank-gap='true']")).toHaveLength(0);
    expect(finalistRows[0]).toHaveAttribute("data-placement", "1st");
    expect(finalistRows[0]).toHaveAttribute("data-accent", "gold");
    expect(finalistRows[0]).toHaveClass("final-row-gold");
    expect(finalistRows[0]).toHaveAttribute("data-leader", "true");
    expect(finalistRows[0]).toHaveTextContent("#1");
    expect(finalistRows[0].querySelector(".final-placement-marker")).not.toBeInTheDocument();
    expect(finalistRows[1]).toHaveAttribute("data-accent", "silver");
    expect(finalistRows[1]).toHaveClass("final-row-silver");
    expect(finalistRows[1]).toHaveTextContent("#2");
    expect(finalistRows[1].querySelector(".final-placement-marker")).not.toBeInTheDocument();
    expect(finalistRows[2]).toHaveAttribute("data-accent", "bronze");
    expect(finalistRows[2]).toHaveClass("final-row-bronze");
    expect(finalistRows[2]).toHaveTextContent("#3");
    expect(finalistRows[2].querySelector(".final-placement-marker")).not.toBeInTheDocument();
    expect(finalistRows[3]).toHaveAttribute("data-accent", "mint");
    expect(finalistRows[3]).toHaveClass("final-row-mint");
    expect(finalistRows[3]).toHaveTextContent("#4");
    expect(finalistRows[3].querySelector(".final-placement-marker")).not.toBeInTheDocument();
    expect(finalistRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dataset: expect.objectContaining({ placement: "1st" }) }),
        expect.objectContaining({ dataset: expect.objectContaining({ placement: "2nd" }) }),
        expect.objectContaining({ dataset: expect.objectContaining({ placement: "3rd" }) }),
        expect.objectContaining({ dataset: expect.objectContaining({ placement: "4th" }) }),
      ]),
    );

    finalistRows.forEach((row) => {
      expect(within(row).queryByText("Gap to leader")).not.toBeInTheDocument();
      expect(within(row).queryByText(/Finalist #/i)).not.toBeInTheDocument();
      expect(row.querySelector(".final-row-rank")).toBeInTheDocument();
      expect(row.querySelector(".finalist-trader-lockup")).toBeInTheDocument();
      expect(row.querySelector(".final-row-main-pnl")).toBeInTheDocument();
      expect(row.querySelector(".final-row-recent-activity")).toBeInTheDocument();
      expect(row.querySelector(".final-row-recent-detail")).toBeInTheDocument();
      expect(within(row).queryByText("Recent")).not.toBeInTheDocument();
      expect(row.querySelector(".final-race-track")).not.toBeInTheDocument();
      expect(row.querySelector(".final-race-progress")).not.toBeInTheDocument();
    });
    expect(container.querySelectorAll(".final-row-recent-activity")).toHaveLength(4);
    expect(container.querySelectorAll(".finalist-sparkline")).toHaveLength(0);
    expect(container.querySelectorAll(".final-challenger-sparkline")).toHaveLength(0);
    expect(container.querySelectorAll(".finalist-card-metric")).toHaveLength(0);

    expect(finalistRows[0]).toHaveTextContent("@merdan");
    expect(finalistRows[0]).toHaveTextContent("+$435.00");
    expect(finalistRows[0]).toHaveTextContent("+43.5%");
    expect(finalistRows[0]).toHaveTextContent("$1,435.00");
    expect(finalistRows[0]).toHaveTextContent("$63.6K");
    expect(finalistRows[0]).toHaveTextContent("CLOSE");
    expect(finalistRows[0]).toHaveTextContent("LONG");
    expect(finalistRows[0]).toHaveTextContent("SOL");
    expect(finalistRows[0]).toHaveTextContent("+$42.00");
    expect(finalistRows[0]).toHaveTextContent("18.2 @ $162.40");
    expect(finalistRows[1]).toHaveTextContent("+$428.00");
    expect(finalistRows[1]).toHaveTextContent("$1,428.00");
    expect(finalistRows[1]).toHaveTextContent("$59.2K");
    expect(finalistRows[1]).toHaveTextContent("#2");
    expect(finalistRows[2]).toHaveTextContent("#3");
    expect(finalistRows[3]).toHaveTextContent("#4");
    expect(finalistRows[3]).toHaveTextContent("SOL");
    expect(finalistRows[3]).not.toHaveTextContent("JUP");
    expect(
      finalistRows.every((row) => ["BTC", "ETH", "SOL"].some((market) => row.textContent?.includes(market))),
    ).toBe(true);
    expect(screen.queryByText("VS")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".final-gap-divider")).toHaveLength(0);
    expect(container.querySelectorAll(".final-gap-value")).toHaveLength(0);
    expect(container.querySelectorAll(".final-chase-gap")).toHaveLength(0);
    expect(container.querySelectorAll(".final-race-gap")).toHaveLength(0);
    expect(container.querySelector(".summit-final-side-patterns")).toBeInTheDocument();
    expect(screen.queryByText("Reconnecting")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("can simulate live final updates without fetching backend data", () => {
    vi.useFakeTimers();

    render(<SummitFinalPage mockLive />);

    expect(screen.getByRole("timer", { name: "Final timer" })).toHaveTextContent("30:00");
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("@merdan");

    act(() => {
      vi.advanceTimersByTime(6_000);
    });

    const finalistRows = screen.getAllByRole("listitem");
    expect(screen.getByRole("timer", { name: "Final timer" })).toHaveTextContent("29:54");
    expect(finalistRows[0]).toHaveTextContent("@juptrader");
    expect(finalistRows[0]).toHaveTextContent("#1");
    expect(finalistRows[0]).toHaveAttribute("data-accent", "gold");
    expect(finalistRows).toHaveLength(4);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("can shorten the final mock timer for celebration testing", () => {
    vi.useFakeTimers();

    render(<SummitFinalPage mockLive mockDurationSeconds={6} />);

    act(() => {
      vi.advanceTimersByTime(6_000);
    });

    expect(screen.getByRole("timer", { name: "Final timer" })).toHaveTextContent("00:00");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
