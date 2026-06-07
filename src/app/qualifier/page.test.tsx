import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import QualifierPage from "./page";

describe("QualifierPage", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(() => new Promise(() => undefined));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders a static Solana Summit hero canvas", () => {
    const { container } = render(<QualifierPage />);

    expect(
      screen.getByRole("img", { name: "Solana Summit Germany" }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll(".summit-side-pattern-left")).toHaveLength(4);
    expect(container.querySelectorAll(".summit-side-pattern-right")).toHaveLength(4);
    expect(container.querySelectorAll(".summit-side-pattern-segment")).toHaveLength(8);
    expect(container.querySelectorAll(".summit-side-pattern-muted")).toHaveLength(8);
    expect(
      screen.getByRole("heading", { name: "Trading Cup" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Trading Cup" })).toHaveClass(
      "uppercase",
    );
    expect(container.querySelector(".qualifier-event-lockup")).toHaveClass(
      "max-w-[340px]",
      "md:max-w-none",
    );
    expect(screen.getByText("Powered by")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Jupiter" })).toBeInTheDocument();
    expect(screen.getByRole("timer", { name: "Qualifier timer" })).toHaveTextContent(
      "Qualifier time left",
    );
    expect(screen.getByRole("timer", { name: "Qualifier timer" })).toHaveTextContent(
      "60:00",
    );
    expect(
      screen.getByRole("heading", { name: "Qualifier Leaderboard" }),
    ).toBeInTheDocument();
    const boardTitle = container.querySelector(".qualifier-board-title");
    expect(boardTitle).toHaveClass("mt-4", "mb-5");
    expect(boardTitle).toHaveClass("justify-center");
    expect(boardTitle).not.toHaveClass("qualifier-board-title-glass");
    expect(container.querySelector(".qualifier-board-title-label")).toHaveClass(
      "qualifier-board-title-glass",
    );
    expect(container.querySelector(".qualifier-board-title-accent")).not.toBeInTheDocument();
    expect(container.querySelector(".qualifier-board-title-label")).toContainElement(
      screen.getByRole("heading", { name: "Qualifier Leaderboard" }),
    );
    expect(boardTitle).toContainElement(
      screen.getByRole("heading", { name: "Qualifier Leaderboard" }),
    );
    expect(screen.getByRole("list", { name: "Qualifier leaderboard" })).toBeInTheDocument();
    expect(screen.getByText("Trader")).toBeInTheDocument();
    expect(container.querySelector(".qualifier-mobile-board-header")).toHaveClass(
      "grid",
      "sm:hidden",
    );
    expect(screen.getByText("Trader / X handle")).toBeInTheDocument();
    expect(screen.getByText("PnL USD")).toBeInTheDocument();
    expect(screen.getByText("PnL %")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(25);
    expect(screen.getAllByRole("listitem")[0]).toHaveClass("sm:min-h-[56px]");
    expect(screen.getAllByRole("listitem")[0]).toHaveClass("qualifier-row-glass");
    expect(screen.getAllByRole("listitem")[0]).toHaveClass("qualifier-row-higher-transparency");
    expect(screen.getAllByRole("listitem")[0]).toHaveClass("qualifier-row-extra-transparent");
    expect(screen.getAllByRole("listitem")[0]).toHaveClass("qualifier-row-qualifying");
    expect(screen.getAllByRole("listitem")[0]).toHaveClass("qualifier-row-qualifying-colored-fill");
    expect(screen.getAllByRole("listitem")[0]).toHaveClass("qualifier-row-qualifying-subtle");
    expect(screen.getAllByRole("listitem")[0]).toHaveClass("qualifier-row-qualifying-soft-fill");
    expect(screen.getAllByRole("listitem")[0]).toHaveClass("qualifier-row-qualifying-gold-border");
    expect(screen.getAllByRole("listitem")[4]).not.toHaveClass("qualifier-row-qualifying");
    expect(screen.getAllByRole("listitem")[4]).toHaveClass("qualifier-row-glass");
    expect(screen.getAllByRole("listitem")[4]).toHaveClass("qualifier-row-higher-transparency");
    expect(screen.getAllByRole("listitem")[4]).toHaveClass("qualifier-row-extra-transparent");
    expect(screen.getAllByRole("listitem")[4]).toHaveClass("qualifier-row-more-transparent");
    expect(screen.getAllByRole("listitem")[4]).toHaveClass("qualifier-row-standard-glass");
    expect(
      screen.getAllByRole("listitem").filter((row) => row.dataset.qualifying === "true"),
    ).toHaveLength(4);
    expect(screen.getByText("Top 4 qualify for the final")).toBeInTheDocument();
    expect(
      screen.getByText("Top 4 qualify for the final").closest("[data-qualification-divider='true']"),
    ).toHaveClass("qualification-divider");
    expect(
      screen.getByText("Top 4 qualify for the final").closest("[data-qualification-divider='true']")
        ?.parentElement,
    ).toBe(screen.getByRole("list", { name: "Qualifier leaderboard" }));
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("#4")).toBeInTheDocument();
    expect(screen.getByText("#5")).toBeInTheDocument();
    expect(screen.getByText("@merdan")).toBeInTheDocument();
    expect(screen.getByText("+$36.80")).toBeInTheDocument();
    expect(screen.getByText("$136.80")).toBeInTheDocument();
    expect(screen.getByText("$5.7K")).toBeInTheDocument();
    expect(screen.getByText("-$2.40")).toBeInTheDocument();
    expect(screen.getByText("$87.90")).toBeInTheDocument();
    expect(screen.queryByText("Reconnecting")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
