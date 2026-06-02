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
    expect(
      screen.getByRole("heading", { name: "Trading Cup" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Trading Cup" })).toHaveClass(
      "uppercase",
    );
    expect(screen.getByText("Powered by")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Jupiter" })).toBeInTheDocument();
    expect(screen.getByRole("timer", { name: "Qualifier timer" })).toHaveTextContent(
      "60:00",
    );
    expect(screen.getByRole("list", { name: "Qualifier leaderboard" })).toBeInTheDocument();
    expect(screen.getByText("Trader / X handle")).toBeInTheDocument();
    expect(screen.getByText("PnL USD")).toBeInTheDocument();
    expect(screen.getByText("PnL %")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(25);
    expect(
      screen.getAllByRole("listitem").filter((row) => row.dataset.qualifying === "true"),
    ).toHaveLength(4);
    expect(screen.getByText("Top 4 qualify for the final")).toBeInTheDocument();
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("#4")).toBeInTheDocument();
    expect(screen.getByText("#5")).toBeInTheDocument();
    expect(screen.getByText("@merdan")).toBeInTheDocument();
    expect(screen.getByText("+$18,420")).toBeInTheDocument();
    expect(screen.getByText("-$1,220")).toBeInTheDocument();
    expect(screen.queryByText("Reconnecting")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
