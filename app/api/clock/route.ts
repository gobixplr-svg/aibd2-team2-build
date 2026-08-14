// POST /api/clock — the demo speed control.
//
// This is the single most load-bearing endpoint for Saturday. Every
// time-based claim we make — risk firing before a 4:30 discharge, the
// 24h pickup SLA aging out, after-hours coverage — happens on a scale
// we cannot wait out during a five-minute pitch.
//
// It does NOT fake anything. It moves the clock that tick() already
// reads as a parameter, so the same code path produces the same
// result it would at 2 AM on a Tuesday.
//
//   { "speed": 60 }      one minute per second
//   { "jumpHours": 25 }  age the pickup SLA past its window
//   { "reset": true }    back to real time

import { NextResponse } from "next/server";
import { getWorld, putWorld } from "@/lib/data/db";
import { freshClock, jumpHours, setSpeed, virtualNow } from "@/lib/engine/clock";
import { hermesAuthorized } from "@/lib/hermes-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Same lock as /api/tick — moving the demo clock is as load-bearing
  // as ticking it. GET (read-only status) stays open.
  if (!hermesAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as {
      speed?: number;
      jumpHours?: number;
      reset?: boolean;
    };

    let world = await getWorld();

    if (body.reset) {
      world = await putWorld({ ...world, clock: freshClock(Date.now()) });
    }
    if (typeof body.speed === "number") {
      if (!(body.speed > 0) || body.speed > 100_000) {
        return NextResponse.json(
          { ok: false, error: "speed must be > 0 and <= 100000" },
          { status: 400 },
        );
      }
      world = await setSpeed(body.speed);
    }
    if (typeof body.jumpHours === "number") {
      world = await jumpHours(body.jumpHours);
    }

    return NextResponse.json({
      ok: true,
      clock: world.clock,
      now: new Date(virtualNow(world.clock, Date.now())).toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function GET() {
  const world = await getWorld();
  return NextResponse.json({
    ok: true,
    clock: world.clock,
    now: new Date(virtualNow(world.clock, Date.now())).toISOString(),
    real: new Date().toISOString(),
  });
}
