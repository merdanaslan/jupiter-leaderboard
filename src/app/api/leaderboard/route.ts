import { NextResponse } from "next/server";
import { getPublicLeaderboard } from "@/lib/runtime";
import type { CompetitionMode } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const modeParam = searchParams.get("mode");
  const mode: CompetitionMode = modeParam === "final" ? "final" : "qualifier";

  return NextResponse.json(await getPublicLeaderboard(mode));
}
