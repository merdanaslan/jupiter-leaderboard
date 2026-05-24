import { PublicKey } from "@solana/web3.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const fetchRecentTradeEvents = vi.fn();
const mockClient = {
  programId: new PublicKey("PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu"),
  eventAuthority: new PublicKey("37hJBDnntwqhGbK7L6M1bLyvccj4u55CCUiLPdYkiqBN"),
  fetchRecentTradeEvents,
};

vi.mock("@/lib/data-sources/jupiter-perps-client", () => ({
  createJupiterPerpsClientFromEnv: () => mockClient,
}));

describe("/api/operator/jupiter-perps/events", () => {
  beforeEach(() => {
    fetchRecentTradeEvents.mockReset();
    fetchRecentTradeEvents.mockResolvedValue({
      signatures: ["sig"],
      events: [
        {
          owner: "11111111111111111111111111111111",
          signature: "sig",
          slot: 1,
        },
      ],
    });
  });

  it("fetches recent parsed Jupiter Perps events with optional wallet filters", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/operator/jupiter-perps/events?walletAddresses=11111111111111111111111111111111&signatureLimit=5",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(fetchRecentTradeEvents).toHaveBeenCalledWith({
      walletAddresses: ["11111111111111111111111111111111"],
      sinceUnixSeconds: undefined,
      signatureLimit: 5,
    });
    expect(body).toEqual(
      expect.objectContaining({
        fetchedSignatureCount: 1,
        parsedEventCount: 1,
        filteredWalletCount: 1,
      }),
    );
  });

  it("rejects invalid wallet filters before touching RPC", async () => {
    const response = await GET(
      new Request("http://localhost/api/operator/jupiter-perps/events?walletAddresses=not-a-wallet"),
    );

    expect(response.status).toBe(400);
    expect(fetchRecentTradeEvents).not.toHaveBeenCalled();
  });
});
