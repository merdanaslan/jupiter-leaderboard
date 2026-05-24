import { PublicKey } from "@solana/web3.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const fetchWalletSnapshots = vi.fn();
const subscribeTradeEventsForWallets = vi.fn();
const subscribePositionsForWallet = vi.fn();
const fetchOraclePrices = vi.fn();
const subscribeOraclePrices = vi.fn();
const removeOnLogsListener = vi.fn();
const removeAccountChangeListener = vi.fn();
const solstreamStart = vi.fn();
const solstreamConstructor = vi.fn();
const mockClient = {
  programId: new PublicKey("PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu"),
  eventAuthority: new PublicKey("37hJBDnntwqhGbK7L6M1bLyvccj4u55CCUiLPdYkiqBN"),
  connection: {
    removeOnLogsListener,
    removeAccountChangeListener,
  },
  fetchWalletSnapshots,
  subscribeTradeEventsForWallets,
  subscribePositionsForWallet,
  oracleClient: {
    fetchOraclePrices,
    subscribeOraclePrices,
  },
};

vi.mock("@/lib/data-sources/jupiter-perps-client", () => ({
  createJupiterPerpsClientFromEnv: () => mockClient,
}));

vi.mock("@/lib/data-sources/jupiter-perps-solstream-live-tracker", () => ({
  JupiterPerpsSolstreamLiveTracker: vi.fn().mockImplementation((client, options) => {
    solstreamConstructor(client, options);
    return {
      start: solstreamStart,
    };
  }),
}));

describe("/api/operator/jupiter-perps/watch", () => {
  beforeEach(() => {
    fetchWalletSnapshots.mockReset();
    subscribeTradeEventsForWallets.mockReset();
    subscribePositionsForWallet.mockReset();
    fetchOraclePrices.mockReset();
    subscribeOraclePrices.mockReset();
    removeOnLogsListener.mockReset();
    removeAccountChangeListener.mockReset();
    solstreamStart.mockReset();
    solstreamConstructor.mockReset();
    fetchWalletSnapshots.mockResolvedValue({
      programId: "program",
      eventAuthority: "event-authority",
      fetchedSignatureCount: 0,
      parsedEventCount: 0,
      wallets: [
        {
          walletAddress: "11111111111111111111111111111111",
          positions: [],
          trades: [],
          notionalVolumeUsd: 0,
          realizedPnlUsd: 0,
          unrealizedPnlUsd: 0,
          totalPnlUsd: 0,
        },
      ],
    });
    subscribeTradeEventsForWallets.mockReturnValue(77);
    subscribePositionsForWallet.mockReturnValue(88);
    fetchOraclePrices.mockResolvedValue([]);
    subscribeOraclePrices.mockReturnValue([]);
    solstreamStart.mockImplementation(async (onUpdate) => {
      onUpdate({
        reason: "initial",
        receivedAt: "2026-05-24T10:00:00.000Z",
        snapshots: [
          {
            walletAddress: "11111111111111111111111111111111",
            positions: [],
            trades: [],
            notionalVolumeUsd: 0,
            realizedPnlUsd: 0,
            unrealizedPnlUsd: 0,
            totalPnlUsd: 0,
          },
        ],
      });
      return async () => undefined;
    });
  });

  it("streams ready metadata and live wallet snapshots", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/operator/jupiter-perps/watch?walletAddresses=11111111111111111111111111111111&includeOraclePrices=false&heartbeatSeconds=5",
      ),
    );
    const reader = response.body?.getReader();
    const ready = new TextDecoder().decode((await reader?.read())?.value);
    const snapshot = new TextDecoder().decode((await reader?.read())?.value);
    await reader?.cancel();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(ready).toContain("event: ready");
    expect(ready).toContain('"walletCount":1');
    expect(snapshot).toContain("event: snapshot");
    expect(snapshot).toContain('"reason":"initial"');
    expect(fetchWalletSnapshots).toHaveBeenCalledWith(
      expect.objectContaining({
        walletAddresses: ["11111111111111111111111111111111"],
        includeClosedPositions: false,
      }),
    );
    expect(subscribeTradeEventsForWallets).toHaveBeenCalled();
    expect(subscribePositionsForWallet).toHaveBeenCalled();
    expect(fetchOraclePrices).not.toHaveBeenCalled();
    expect(subscribeOraclePrices).not.toHaveBeenCalled();
  });

  it("can stream snapshots through the Solstream transport", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/operator/jupiter-perps/watch?walletAddresses=11111111111111111111111111111111&transport=solstream&fromSlot=123&includeOraclePrices=true&heartbeatSeconds=5",
      ),
    );
    const reader = response.body?.getReader();
    const ready = new TextDecoder().decode((await reader?.read())?.value);
    const snapshot = new TextDecoder().decode((await reader?.read())?.value);
    await reader?.cancel();

    expect(response.status).toBe(200);
    expect(ready).toContain('"transport":"solstream"');
    expect(ready).toContain('"fromSlot":123');
    expect(snapshot).toContain("event: snapshot");
    expect(snapshot).toContain('"reason":"initial"');
    expect(solstreamConstructor).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({
        walletAddresses: ["11111111111111111111111111111111"],
        fromSlot: 123,
        signatureLimit: 0,
        includeOraclePrices: true,
      }),
    );
    expect(solstreamStart).toHaveBeenCalled();
    expect(subscribeTradeEventsForWallets).not.toHaveBeenCalled();
    expect(subscribePositionsForWallet).not.toHaveBeenCalled();
  });

  it("rejects watch streams without valid wallet filters", async () => {
    const missingWalletResponse = await GET(new Request("http://localhost/api/operator/jupiter-perps/watch"));
    const invalidWalletResponse = await GET(
      new Request("http://localhost/api/operator/jupiter-perps/watch?walletAddresses=not-a-wallet"),
    );

    expect(missingWalletResponse.status).toBe(400);
    expect(invalidWalletResponse.status).toBe(400);
    expect(fetchWalletSnapshots).not.toHaveBeenCalled();
  });

  it("rejects invalid boolean query values", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/operator/jupiter-perps/watch?walletAddresses=11111111111111111111111111111111&includeOraclePrices=nope",
      ),
    );

    expect(response.status).toBe(400);
    expect(fetchWalletSnapshots).not.toHaveBeenCalled();
  });
});
