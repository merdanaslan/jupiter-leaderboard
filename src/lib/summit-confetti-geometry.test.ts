import { describe, expect, it } from "vitest";

import { getConfettiOriginFromRect } from "./summit-confetti-geometry";

describe("summit confetti geometry", () => {
  it("places a burst at the visual center of a row", () => {
    expect(
      getConfettiOriginFromRect(
        { left: 100, top: 300, width: 800, height: 80 },
        { width: 1_000, height: 1_000 },
      ),
    ).toEqual({ x: 0.5, y: 0.34 });
  });

  it("keeps origins inside the viewport for rows near an edge", () => {
    expect(
      getConfettiOriginFromRect(
        { left: -200, top: -20, width: 80, height: 20 },
        { width: 1_000, height: 1_000 },
      ),
    ).toEqual({ x: 0.02, y: 0.02 });
  });
});
