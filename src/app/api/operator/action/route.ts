import { NextResponse } from "next/server";
import { z } from "zod";
import { applyOperatorStateAction } from "@/lib/runtime";

const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("start"),
    now: z.string().datetime().optional(),
  }),
  z.object({
    type: z.literal("lock"),
  }),
  z.object({
    type: z.literal("reset"),
    mode: z.enum(["qualifier", "final"]).optional(),
  }),
  z.object({
    type: z.literal("setMode"),
    mode: z.enum(["qualifier", "final"]),
  }),
  z.object({
    type: z.literal("setScenario"),
    scenario: z.enum([
      "steady",
      "close-race",
      "top-4-battle",
      "negative-market",
      "last-minute-upset",
      "interruption",
      "locked",
    ]),
  }),
  z.object({
    type: z.literal("selectFinalists"),
    finalistIds: z.array(z.string()).max(4),
  }),
]);

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsed = actionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid operator action" }, { status: 400 });
  }

  return NextResponse.json(await applyOperatorStateAction(parsed.data));
}
