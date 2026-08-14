// POST /api/tick — run one Hermes heartbeat.
//
// Three things drive this endpoint and they all call the same
// function with a different clock:
//   · Trigger.dev cron, every 5 min          (production)
//   · the demo speed control                 (on stage)
//   · you, from curl                         (right now)
//
// If a judge asks whether the risk engine is real: identical
// function, we're just turning time faster.

import { NextResponse } from "next/server";
import { engineNow } from "@/lib/engine/clock";
import { tick } from "@/lib/engine/tick";
import { hermesAuthorized } from "@/lib/hermes-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!hermesAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  try {
    const now = await engineNow();
    const result = await tick(now);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

// Convenience for the browser — same work, so you can hit it from a phone.
export async function GET(req: Request) {
  return POST(req);
}
