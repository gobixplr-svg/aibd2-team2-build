// POST /api/orders — create an order (the hospice order form).
// Thin wrapper: validates, stamps engine time, persists, appends the
// eRx-shaped event. (Dan — wraps Will's db; shout if you want it moved.)

import { NextResponse } from "next/server";
import type { Order } from "@/lib/contracts";
import { appendEvent, getOrder, putOrder } from "@/lib/data/db";
import { engineNow } from "@/lib/engine/clock";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<Order>;
    if (!body.patientId || !body.vendorId || !body.items?.length || !body.targetAt) {
      return NextResponse.json(
        { ok: false, error: "patientId, vendorId, items, targetAt required" },
        { status: 400 },
      );
    }
    const now = await engineNow();
    const id = body.id ?? `ord-${Date.now().toString(36)}`;
    if (await getOrder(id)) {
      return NextResponse.json({ ok: false, error: "duplicate id" }, { status: 409 });
    }
    const order: Order = {
      id,
      patientId: body.patientId,
      patientLabel: body.patientLabel ?? body.patientId,
      address: body.address ?? "Address on file",
      items: body.items,
      urgency: body.urgency ?? "routine",
      vendorId: body.vendorId,
      targetAt: body.targetAt,
      state: "ordered",
      note: body.note,
      timestamps: { ordered: new Date(now).toISOString() },
    };
    await putOrder(order);
    await appendEvent({
      meta: { eventType: "newDmeOrder", at: new Date(now).toISOString() },
      account: { identifiers: [{ id: order.patientId }] },
      payload: { orderId: order.id, vendorId: order.vendorId, urgency: order.urgency },
    });
    return NextResponse.json({ ok: true, order });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
