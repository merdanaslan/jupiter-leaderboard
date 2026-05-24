import { PublicKey } from "@solana/web3.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const subscribeTradeEventsForWallets = vi.fn();
const removeOnLogsListener = vi.fn();
const mockClient = {
  programId: new PublicKey("PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu"),
  eventAuthority: new PublicKey("37hJBDnntwqhGbK7L6M1bLyvccj4u55CCUiLPdYkiqBN"),
  connection: {
    removeOnLogsListener,
  },
  subscribeTradeEventsForWallets,
};

vi.mock("@/lib/data-sources/jupiter-perps-client", () => ({
  createJupiterPerpsClientFromEnv: () => mockClient,
}));

describe("/api/operator/jupiter-perps/stream", () => {
  beforeEach(() => {
    subscribeTradeEventsForWallets.mockReset();
    removeOnLogsListener.mockReset();
    subscribeTradeEventsForWallets.mockReturnValue(77);
  });

  it("opens an SSE stream for specific wallets and emits ready metadata", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/operator/jupiter-perps/stream?walletAddresses=11111111111111111111111111111111&heartbeatSeconds=5",
      ),
    );
    const reader = response.body?.getReader();
    const chunk = await reader?.read();
    const text = new TextDecoder().decode(chunk?.value);
    await reader?.cancel();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(text).toContain("event: ready");
    expect(text).toContain('"walletCount":1');
    expect(subscribeTradeEventsForWallets).toHaveBeenCalledWith(
      ["11111111111111111111111111111111"],
      expect.any(Function),
      expect.objectContaining({
        logFilter: "event-authority",
      }),
    );
    expect(removeOnLogsListener).toHaveBeenCalledWith(77);
  });

  it("rejects streams without valid wallet filters", async () => {
    const missingWalletResponse = await GET(new Request("http://localhost/api/operator/jupiter-perps/stream"));
    const invalidWalletResponse = await GET(
      new Request("http://localhost/api/operator/jupiter-perps/stream?walletAddresses=not-a-wallet"),
    );

    expect(missingWalletResponse.status).toBe(400);
    expect(invalidWalletResponse.status).toBe(400);
    expect(subscribeTradeEventsForWallets).not.toHaveBeenCalled();
  });
});
