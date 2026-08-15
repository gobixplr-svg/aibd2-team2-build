// POST /api/inbox — create an approval item from a human action on the
// portal (request reroute, draft family message). Hermes creates its own
// items inside tick(); this is the human-initiated path.
//
// family_message items get their draft written HERE, server-side, by
// Claude (template fallback if it can't run) — so the human_facing tier
// always has real words to review, and the key never leaves the server.

import { NextResponse } from "next/server";
import type { ActionTier, InboxItem } from "@/lib/contracts";
import { draftFamilyMessage } from "@/lib/ai/draft-note";
import { appendLedger, getOrders, getPatient, putInboxItem } from "@/lib/data/db";
import { engineNow } from "@/lib/engine/clock";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      source: InboxItem["source"];
      tier?: ActionTier;
      title: string;
      detail: string;
      orderId?: string;
      patientId?: string;
      proposedAction?: string;
      draft?: string;
    };
    if (!body.title || !body.source) {
      return NextResponse.json({ ok: false, error: "title + source required" }, { status: 400 });
    }
    const now = await engineNow();

    // The swap point draft-note.ts was stubbed for: a family_message
    // item arrives with no draft → Claude writes the first pass from
    // facts we look up ourselves (never from client-supplied text).
    let draft = body.draft;
    let detail = body.detail;
    if (!draft && body.source === "family_message" && body.patientId) {
      const patient = await getPatient(body.patientId);
      const patientOrders = (await getOrders()).filter(
        (o) => o.patientId === body.patientId,
      );
      // The draft must match the order's CURRENT phase — a pickup message
      // about equipment that's still on the truck is worse than none.
      // Priority: open pickup (post-death, most sensitive) → in-flight
      // delivery → everything delivered (calm check-in). Equipment names
      // come from the phase-relevant order only, never the whole census
      // history for the patient.
      const pickupOrder = patientOrders.find((o) => o.pickup && !o.pickup.completedAt);
      const deliveryOrder = patientOrders.find((o) =>
        ["ordered", "dispatched", "in_transit", "at_risk"].includes(o.state),
      );
      const focus = pickupOrder ?? deliveryOrder;
      const result = await draftFamilyMessage({
        patientLabel: patient?.label ?? body.patientId,
        kind: pickupOrder ? "pickup_update" : deliveryOrder ? "delivery_update" : "general_update",
        equipment: [
          ...new Set(
            (focus ? [focus] : patientOrders).flatMap((o) => o.items.map((i) => i.name)),
          ),
        ],
        windowStart: pickupOrder?.pickup?.windowStart ?? null,
        windowEnd: pickupOrder?.pickup?.windowEnd ?? null,
        etaAt: !pickupOrder ? (deliveryOrder?.etaAt ?? null) : null,
        orderId: focus?.id,
      });
      draft = result.text;
      if (result.ledger) await appendLedger(result.ledger);
      if (!result.aiUsed) {
        detail = `${detail} (template draft — AI unavailable: ${result.fallbackReason})`;
      }
    }

    const item: InboxItem = {
      id: `inbox-${Date.now().toString(36)}`,
      createdAt: new Date(now).toISOString(),
      tier: body.tier ?? "consequential",
      orderId: body.orderId,
      patientId: body.patientId,
      title: body.title,
      detail,
      reasons: [],
      reasonCodes: [],
      proposedAction: body.proposedAction ?? "manual",
      status: "pending",
      source: body.source,
      draft,
    };
    await putInboxItem(item);
    return NextResponse.json({ ok: true, item });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
