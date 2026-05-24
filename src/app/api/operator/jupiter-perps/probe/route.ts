import { NextResponse } from "next/server";
import { z } from "zod";
import { createJupiterPerpsClientFromEnv } from "@/lib/data-sources/jupiter-perps-client";
import { normalizeSolanaPublicKeys } from "@/lib/data-sources/jupiter-perps-request";

const probeSchema = z.object({
  walletAddresses: z.array(z.string().min(32)).min(1).max(100),
  sinceUnixSeconds: z.number().int().positive().optional(),
  signatureLimit: z.number().int().min(0).max(2_000).optional(),
  includeClosedPositions: z.boolean().optional(),
  includeOraclePrices: z.boolean().optional(),
});

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsed = probeSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Jupiter Perps probe request" }, { status: 400 });
  }

  let walletAddresses: string[];
  try {
    walletAddresses = normalizeSolanaPublicKeys(parsed.data.walletAddresses);
  } catch {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
  }

  try {
    const client = createJupiterPerpsClientFromEnv();
    const result = await client.fetchWalletSnapshots({
      walletAddresses,
      sinceUnixSeconds: parsed.data.sinceUnixSeconds,
      signatureLimit: parsed.data.signatureLimit,
      includeClosedPositions: parsed.data.includeClosedPositions,
      includeOraclePrices: parsed.data.includeOraclePrices,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to probe Jupiter Perps on-chain data",
      },
      { status: 500 },
    );
  }
}
