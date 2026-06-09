import { describe, expect, it } from "vitest";
import { noStoreHeaders, noStoreJson } from "./no-store";

describe("noStoreJson", () => {
  it("returns JSON responses with explicit no-store headers", async () => {
    const response = noStoreJson({ ok: true });

    expect(response.headers.get("Cache-Control")).toBe(noStoreHeaders["Cache-Control"]);
    expect(response.headers.get("Pragma")).toBe(noStoreHeaders.Pragma);
    expect(response.headers.get("Expires")).toBe(noStoreHeaders.Expires);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("preserves custom response init fields while forcing no-store headers", () => {
    const response = noStoreJson(
      { error: "Invalid operator action" },
      {
        headers: {
          "Cache-Control": "public, max-age=60",
          "X-Test": "yes",
        },
        status: 400,
      },
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe(noStoreHeaders["Cache-Control"]);
    expect(response.headers.get("X-Test")).toBe("yes");
  });
});
