import { NextResponse } from "next/server";
import { z } from "zod";
import { createJupiterPerpsClientFromEnv } from "@/lib/data-sources/jupiter-perps-client";
import {
  normalizeSolanaPublicKeys,
  parseWalletAddressList,
} from "@/lib/data-sources/jupiter-perps-request";

const eventsQuerySchema = z.object({
  sinceUnixSeconds: z.coerce.number().int().positive().optional(),
  signatureLimit: z.coerce.number().int().positive().max(2_000).default(100),
});

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = eventsQuerySchema.safeParse({
    sinceUnixSeconds: url.searchParams.get("sinceUnixSeconds") ?? undefined,
    signatureLimit: url.searchParams.get("signatureLimit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Jupiter Perps events request" }, { status: 400 });
  }

  const requestedWalletAddresses = parseWalletAddressList({
    repeated: url.searchParams.getAll("walletAddress"),
    combined: url.searchParams.get("walletAddresses"),
  });

  let walletAddresses: string[];
  try {
    walletAddresses = normalizeSolanaPublicKeys(requestedWalletAddresses);
  } catch {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
  }

  try {
    const client = createJupiterPerpsClientFromEnv();
    const result = await client.fetchRecentTradeEvents({
      walletAddresses: walletAddresses.length ? walletAddresses : undefined,
      sinceUnixSeconds: parsed.data.sinceUnixSeconds,
      signatureLimit: parsed.data.signatureLimit,
    });

    return NextResponse.json({
      programId: client.programId.toBase58(),
      eventAuthority: client.eventAuthority.toBase58(),
      fetchedSignatureCount: result.signatures.length,
      parsedEventCount: result.events.length,
      filteredWalletCount: walletAddresses.length,
      events: result.events,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to fetch Jupiter Perps events",
      },
      { status: 500 },
    );
  }
}
