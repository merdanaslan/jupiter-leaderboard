import { describe, expect, it } from "vitest";
import { getBasicAuthHeader, isOperatorAuthorized } from "./operator-auth";

describe("operator auth", () => {
  it("rejects requests when no operator password is configured", () => {
    expect(
      isOperatorAuthorized({
        authorizationHeader: getBasicAuthHeader("operator", "secret"),
        operatorPassword: undefined,
      }),
    ).toBe(false);
  });

  it("accepts matching basic auth credentials", () => {
    expect(
      isOperatorAuthorized({
        authorizationHeader: getBasicAuthHeader("operator", "secret"),
        operatorPassword: "secret",
      }),
    ).toBe(true);
  });

  it("rejects incorrect passwords", () => {
    expect(
      isOperatorAuthorized({
        authorizationHeader: getBasicAuthHeader("operator", "wrong"),
        operatorPassword: "secret",
      }),
    ).toBe(false);
  });
});
