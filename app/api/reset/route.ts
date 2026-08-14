// POST /api/reset — wipe and reseed the world, deterministically.
//
// Run this before every rehearsal and immediately before the real
// demo. The seed is a pure function of `now`, so the world comes
// back byte-identical every time — which is what makes rehearsing
// safe instead of something we're afraid to touch.
//
// GET returns a count so you can confirm it worked from a phone.

import { NextResponse } from "next/server";
import {
  DEFAULT_WORLD,
  getOrders,
  isPersistent,
  putOrders,
  putPatients,
  putVendors,
  putWorld,
  wipe,
} from "@/lib/data/db";
import { freshClock } from "@/lib/engine/clock";
import { buildSeed } from "@/lib/data/seed";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const realNow = Date.now();
    await wipe();

    // Reset pins the clock back to real time — a rehearsal that ran
    // at 60x must not leave the next one starting two days late.
    await putWorld({ ...DEFAULT_WORLD, clock: freshClock(realNow) });

    const seed = buildSeed(realNow);
    await putPatients(seed.patients);
    await putVendors(seed.vendors);
    await putOrders(seed.orders);

    return NextResponse.json({
      ok: true,
      persistent: isPersistent,
      seeded: {
        patients: seed.patients.length,
        vendors: seed.vendors.length,
        orders: seed.orders.length,
      },
      at: new Date(realNow).toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const orders = await getOrders();
    return NextResponse.json({
      ok: true,
      persistent: isPersistent,
      orders: orders.length,
      hint: "POST to this endpoint to wipe and reseed",
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
