import { NextResponse } from "next/server";
import { z } from "zod";
import { createJupiterPerpsClientFromEnv } from "@/lib/data-sources/jupiter-perps-client";
import { JupiterPerpsLiveTracker } from "@/lib/data-sources/jupiter-perps-live-tracker";
import { JupiterPerpsSolstreamLiveTracker } from "@/lib/data-sources/jupiter-perps-solstream-live-tracker";
import {
  normalizeSolanaPublicKeys,
  parseWalletAddressList,
  sseMessage,
} from "@/lib/data-sources/jupiter-perps-request";

const watchQuerySchema = z.object({
  heartbeatSeconds: z.coerce.number().int().min(5).max(60).default(15),
  transport: z.enum(["websocket", "solstream"]).default("websocket"),
  logFilter: z.enum(["event-authority", "program"]).default("event-authority"),
  signatureLimit: z.coerce.number().int().min(0).max(2_000).default(100),
  sinceUnixSeconds: z.coerce.number().int().positive().optional(),
  fromSlot: z.coerce.number().int().positive().optional(),
  includeClosedPositions: z.enum(["true", "false"]).optional(),
  includeOraclePrices: z.enum(["true", "false"]).optional(),
});

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedWalletAddresses = parseWalletAddressList({
    repeated: url.searchParams.getAll("walletAddress"),
    combined: url.searchParams.get("walletAddresses"),
  });
  const query = watchQuerySchema.safeParse({
    heartbeatSeconds: url.searchParams.get("heartbeatSeconds") ?? undefined,
    transport: url.searchParams.get("transport") ?? undefined,
    logFilter: url.searchParams.get("logFilter") ?? undefined,
    signatureLimit:
      url.searchParams.get("signatureLimit") ??
      (url.searchParams.get("transport") === "solstream" ? "0" : undefined),
    sinceUnixSeconds: url.searchParams.get("sinceUnixSeconds") ?? undefined,
    fromSlot: url.searchParams.get("fromSlot") ?? undefined,
    includeClosedPositions: url.searchParams.get("includeClosedPositions") ?? undefined,
    includeOraclePrices: url.searchParams.get("includeOraclePrices") ?? undefined,
  });

  if (!query.success || requestedWalletAddresses.length === 0 || requestedWalletAddresses.length > 100) {
    return NextResponse.json({ error: "Invalid Jupiter Perps watch request" }, { status: 400 });
  }

  let walletAddresses: string[];
  try {
    walletAddresses = normalizeSolanaPublicKeys(requestedWalletAddresses);
  } catch {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
  }

  let client: ReturnType<typeof createJupiterPerpsClientFromEnv>;
  try {
    client = createJupiterPerpsClientFromEnv();
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to create Jupiter Perps client",
      },
      { status: 500 },
    );
  }

  const encoder = new TextEncoder();
  let cleanup: () => void = () => undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let stopTracker: (() => Promise<void>) | null = null;
      const send = (event: string, data: unknown) => {
        if (!closed) controller.enqueue(encoder.encode(sseMessage(event, data)));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        if (stopTracker) void stopTracker();
        try {
          controller.close();
        } catch {
          // Reader cancellation can close the controller before cleanup runs.
        }
      };
      const heartbeat = setInterval(() => {
        send("heartbeat", { timestamp: new Date().toISOString() });
      }, query.data.heartbeatSeconds * 1_000);

      request.signal.addEventListener("abort", close, { once: true });
      cleanup = close;

      send("ready", {
        programId: client.programId.toBase58(),
        eventAuthority: client.eventAuthority.toBase58(),
        walletCount: walletAddresses.length,
        transport: query.data.transport,
        logFilter: query.data.logFilter,
        fromSlot: query.data.fromSlot,
        includeOraclePrices: parseBooleanQuery(query.data.includeOraclePrices, true),
        timestamp: new Date().toISOString(),
      });

      const commonTrackerOptions = {
        walletAddresses,
        signatureLimit: query.data.signatureLimit,
        sinceUnixSeconds: query.data.sinceUnixSeconds,
        includeClosedPositions: parseBooleanQuery(query.data.includeClosedPositions, false),
        includeOraclePrices: parseBooleanQuery(query.data.includeOraclePrices, true),
      };
      const tracker =
        query.data.transport === "solstream"
          ? new JupiterPerpsSolstreamLiveTracker(client, {
              ...commonTrackerOptions,
              fromSlot: query.data.fromSlot,
              continueOnInitialSnapshotError: true,
              onError: (error) => {
                send("error", {
                  message: error instanceof Error ? error.message : "Unable to watch Solstream snapshots",
                  receivedAt: new Date().toISOString(),
                });
              },
            })
          : new JupiterPerpsLiveTracker(client, {
              ...commonTrackerOptions,
              logFilter: query.data.logFilter,
            });

      void tracker
        .start((update) => {
          send("snapshot", update);
        })
        .then((stop) => {
          stopTracker = stop;
        })
        .catch((error) => {
          send("error", {
            message: error instanceof Error ? error.message : "Unable to watch Jupiter Perps snapshots",
            receivedAt: new Date().toISOString(),
          });
          close();
        });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no",
    },
  });
}

function parseBooleanQuery(value: "true" | "false" | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value === "true";
}
