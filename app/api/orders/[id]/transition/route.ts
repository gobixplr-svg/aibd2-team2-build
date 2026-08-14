// POST /api/orders/[id]/transition — every human-initiated state change
// (vendor accept/status taps, board drags, nurse pickup trigger) goes
// through Will's applyTransition: single writer, always timestamped.
//   { to, etaAt?, pod?, note?, pickupBy? }  — pickupBy for pickup_triggered

import { NextResponse } from "next/server";
import type { Order, OrderState } from "@/lib/contracts";
import { applyTransition, IllegalTransition, pickupPatch } from "@/lib/engine/transition";
import { getWorld } from "@/lib/data/db";
import { engineNow } from "@/lib/engine/clock";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: RouteContext<"/api/orders/[id]/transition">) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      to: OrderState;
      etaAt?: string;
      pod?: Order["pod"];
      note?: string;
      pickupBy?: "nurse" | "emr";
    };
    const now = await engineNow();
    const patch: Record<string, unknown> = {};
    if (body.etaAt) patch.etaAt = body.etaAt;
    if (body.pod) patch.pod = body.pod;
    if (body.note) patch.note = body.note;
    if (body.to === "pickup_triggered") {
      const world = await getWorld();
      Object.assign(patch, pickupPatch(now, body.pickupBy ?? "nurse", world.policy.pickupSlaHours));
    }
    const order = await applyTransition(id, body.to, now, patch);
    return NextResponse.json({ ok: true, order });
  } catch (err) {
    const status = err instanceof IllegalTransition ? 409 : 500;
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status },
    );
  }
}
