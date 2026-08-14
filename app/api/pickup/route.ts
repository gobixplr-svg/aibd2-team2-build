// POST /api/pickup — the vendor side of retrieval.
//
// Two actions, both of which the ladder watches for the ABSENCE of:
//   { orderId, action: "acknowledge" }
//   { orderId, action: "commit_window", startAt, endAt }
//
// Committing a window is what lets the family page say something
// useful — "Tomorrow 10 AM–12 PM. No one needs to be home." Until a
// window exists there is nothing honest to tell them, which is why
// silence on it is an early signal rather than a cosmetic gap.

import { NextResponse } from "next/server";
import { appendEvent, getOrder, putOrder } from "@/lib/data/db";
import { engineNow } from "@/lib/engine/clock";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { orderId, action, startAt, endAt } = (await req.json()) as {
      orderId: string;
      action: "acknowledge" | "commit_window" | "complete";
      startAt?: string;
      endAt?: string;
    };

    const order = await getOrder(orderId);
    if (!order?.pickup) {
      return NextResponse.json(
        { ok: false, error: "no pickup on that order" },
        { status: 404 },
      );
    }

    const now = await engineNow();
    const iso = new Date(now).toISOString();
    const pickup = { ...order.pickup };

    if (action === "acknowledge") pickup.acknowledgedAt = iso;
    if (action === "commit_window") {
      if (!startAt || !endAt) {
        return NextResponse.json(
          { ok: false, error: "commit_window needs startAt and endAt" },
          { status: 400 },
        );
      }
      // Acknowledging is implied by committing — a dispatcher who books
      // a window has obviously seen it.
      pickup.acknowledgedAt = pickup.acknowledgedAt ?? iso;
      pickup.windowStart = startAt;
      pickup.windowEnd = endAt;
    }
    if (action === "complete") pickup.completedAt = iso;

    await putOrder({ ...order, pickup });
    await appendEvent({
      meta: { eventType: "dmePickupUpdate", at: iso },
      account: { identifiers: [{ id: order.patientId }] },
      payload: { orderId, action, startAt, endAt },
    });

    return NextResponse.json({ ok: true, pickup });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
