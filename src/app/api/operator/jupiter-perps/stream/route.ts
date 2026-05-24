import { NextResponse } from "next/server";
import { z } from "zod";
import { createJupiterPerpsClientFromEnv } from "@/lib/data-sources/jupiter-perps-client";
import {
  normalizeSolanaPublicKeys,
  parseWalletAddressList,
  sseMessage,
} from "@/lib/data-sources/jupiter-perps-request";

const streamQuerySchema = z.object({
  heartbeatSeconds: z.coerce.number().int().min(5).max(60).default(15),
  logFilter: z.enum(["event-authority", "program"]).default("event-authority"),
});

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedWalletAddresses = parseWalletAddressList({
    repeated: url.searchParams.getAll("walletAddress"),
    combined: url.searchParams.get("walletAddresses"),
  });
  const query = streamQuerySchema.safeParse({
    heartbeatSeconds: url.searchParams.get("heartbeatSeconds") ?? undefined,
    logFilter: url.searchParams.get("logFilter") ?? undefined,
  });

  if (!query.success || requestedWalletAddresses.length === 0 || requestedWalletAddresses.length > 100) {
    return NextResponse.json({ error: "Invalid Jupiter Perps stream request" }, { status: 400 });
  }

  let client: ReturnType<typeof createJupiterPerpsClientFromEnv>;
  let walletAddresses: string[];
  try {
    walletAddresses = normalizeSolanaPublicKeys(requestedWalletAddresses);
  } catch {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
  }

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
      let subscriptionId: number | null = null;
      const send = (event: string, data: unknown) => {
        if (!closed) controller.enqueue(encoder.encode(sseMessage(event, data)));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        if (subscriptionId !== null) void client.connection.removeOnLogsListener(subscriptionId);
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

      try {
        subscriptionId = client.subscribeTradeEventsForWallets(
          walletAddresses,
          (trade, context) => {
            send("trade", {
              trade,
              context,
              receivedAt: new Date().toISOString(),
            });
          },
          {
            logFilter: query.data.logFilter,
            onError: (error) => {
              send("error", {
                message: error instanceof Error ? error.message : "Unable to parse Jupiter Perps trade",
                receivedAt: new Date().toISOString(),
              });
            },
          },
        );
        send("ready", {
          programId: client.programId.toBase58(),
          eventAuthority: client.eventAuthority.toBase58(),
          walletCount: walletAddresses.length,
          logFilter: query.data.logFilter,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        send("error", {
          message: error instanceof Error ? error.message : "Unable to subscribe to Jupiter Perps trades",
          receivedAt: new Date().toISOString(),
        });
        close();
      }
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
