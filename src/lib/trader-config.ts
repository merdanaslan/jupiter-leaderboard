import Papa from "papaparse";
import { z } from "zod";
import type { TraderConfig } from "./types";

const traderConfigSchema = z.object({
  id: z.string().min(1),
  xHandle: z.string().min(1),
  displayName: z.string().min(1),
  walletAddress: z.string().min(1),
  status: z.enum(["active", "backup"]),
  mode: z.enum(["qualifier", "final"]),
  startingBalance: z.coerce.number().nonnegative(),
  startingEquity: z.coerce.number().nonnegative(),
  avatarUrl: z.string().optional(),
});

const traderConfigArraySchema = z.array(traderConfigSchema);

export function parseTraderConfig(input: string): TraderConfig[] {
  const trimmed = input.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as unknown;
    const normalized = Array.isArray(parsed) ? parsed : [parsed];
    return traderConfigArraySchema.parse(normalized);
  }

  const parsed = Papa.parse<Record<string, unknown>>(trimmed, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length) {
    throw new Error(parsed.errors.map((error) => error.message).join("; "));
  }

  return traderConfigArraySchema.parse(parsed.data);
}
