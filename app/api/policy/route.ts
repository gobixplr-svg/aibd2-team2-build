// POST /api/policy — the rules-only toggle, and threshold tuning.
//
//   { "useAiTriage": false }
//
// The brief is blunt about this: "Vague appeals to 'AI is smarter' won't
// score well. A concrete comparison will." With no held-out dataset to
// quote an accuracy number from, a live switch is the only honest way to
// show what the model adds — you watch the same input degrade.
//
// It also doubles as the answer to "what happens when the model is
// wrong": this is the floor the product runs on, and it is always there.

import { NextResponse } from "next/server";
import type { Policy } from "@/lib/contracts";
import { getWorld, putWorld } from "@/lib/data/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const patch = (await req.json()) as Partial<Policy>;
    const world = await getWorld();
    const policy = { ...world.policy, ...patch };
    await putWorld({ ...world, policy });
    return NextResponse.json({ ok: true, policy });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function GET() {
  const world = await getWorld();
  return NextResponse.json({ ok: true, policy: world.policy });
}
