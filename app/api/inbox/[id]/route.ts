// POST /api/inbox/[id] — resolve an approval-inbox item.
//   { action: "approve" | "reject", resolvedBy?: string, draft?: string }
//
// Approving now EXECUTES the reroute-family of proposals: the order
// moves to a backup vendor so the other phone's queue actually changes
// when a judge taps Approve. Everything else stays record-only.
//
// Execution never writes order.state — transition() (Will's) remains
// the single writer. A reroute is a vendorId swap plus clearing the old
// vendor's commitments (ETA / pickup ack / window); the state machine
// carries on legally from wherever the order already was.

import { NextResponse } from "next/server";
import type { Order, Vendor } from "@/lib/contracts";
import {
  appendEvent,
  getInbox,
  getOrder,
  getVendors,
  putInboxItem,
  putOrder,
} from "@/lib/data/db";
import { engineNow } from "@/lib/engine/clock";

export const dynamic = "force-dynamic";

const REROUTE_ACTIONS = new Set([
  "reroute_vendor",
  "reassign_pickup",
  "preempt_pickup_breach",
]);

/** Best backup for this order: not the current vendor, connected first,
 *  then pickup speed for pickups / on-time rate for deliveries. */
function pickBackup(vendors: Vendor[], order: Order): Vendor | undefined {
  const isPickup = Boolean(order.pickup && !order.pickup.completedAt);
  return [...vendors]
    .filter((v) => v.id !== order.vendorId)
    .sort((a, b) => {
      if (a.connected !== b.connected) return a.connected ? -1 : 1;
      return isPickup
        ? (a.stats?.avgPickupHours ?? 99) - (b.stats?.avgPickupHours ?? 99)
        : (b.stats?.onTimeRate ?? 0) - (a.stats?.onTimeRate ?? 0);
    })[0];
}

async function executeReroute(
  orderId: string,
  nowIso: string,
): Promise<string | null> {
  const order = await getOrder(orderId);
  if (!order) return null;
  const backup = pickBackup(await getVendors(), order);
  if (!backup) return null;

  const next: Order = {
    ...order,
    vendorId: backup.id,
    etaAt: undefined, // the old vendor's promise doesn't transfer
    pickup: order.pickup
      ? {
          ...order.pickup,
          // New vendor hasn't seen it yet — ladder restarts honestly.
          acknowledgedAt: undefined,
          windowStart: undefined,
          windowEnd: undefined,
        }
      : undefined,
  };
  await putOrder(next);
  await appendEvent({
    meta: { eventType: "orderRerouted", at: nowIso },
    account: { identifiers: [{ id: order.patientId }] },
    payload: { orderId: order.id, from: order.vendorId, to: backup.id },
  });
  return backup.name;
}

export async function POST(req: Request, ctx: RouteContext<"/api/inbox/[id]">) {
  try {
    const { id } = await ctx.params;
    const { action, resolvedBy, draft } = (await req.json()) as {
      action: "approve" | "reject";
      resolvedBy?: string;
      // Human's edited version of a Claude draft — the edit is the
      // point of the human_facing tier, so approving persists it.
      draft?: string;
    };
    const item = (await getInbox()).find((i) => i.id === id);
    if (!item) return NextResponse.json({ ok: false, error: "unknown item" }, { status: 404 });
    const now = await engineNow();
    const nowIso = new Date(now).toISOString();

    // Execute before recording, so a failed execution never shows as
    // an approved item that silently did nothing.
    let executed: string | undefined;
    if (
      action === "approve" &&
      item.orderId &&
      REROUTE_ACTIONS.has(item.proposedAction)
    ) {
      const vendorName = await executeReroute(item.orderId, nowIso);
      if (vendorName) executed = `Executed: rerouted to ${vendorName}.`;
    }

    // A family's own words reach vendor dispatch only after a human
    // approves them — the order note is the relay, and the vendor card
    // already renders it. Distress messages never leave the care team.
    let relayed: string | undefined;
    if (
      action === "approve" &&
      item.source === "family_message" &&
      item.orderId &&
      item.proposedAction !== "escalate_on_call_nurse"
    ) {
      const order = await getOrder(item.orderId);
      if (order) {
        const request = item.detail.replace(/^"+|"+$/g, "");
        const note = `Family request (care team approved): ${request}`;
        await putOrder({
          ...order,
          note: order.note ? `${order.note} · ${note}` : note,
        });
        await appendEvent({
          meta: { eventType: "familyRequestRelayed", at: nowIso },
          account: { identifiers: [{ id: order.patientId }] },
          payload: { orderId: order.id, request },
        });
        relayed = "Relayed to vendor dispatch as an order note.";
      }
    }

    const extraReasons = [executed, relayed].filter(
      (r): r is string => Boolean(r),
    );
    const next = {
      ...item,
      draft: action === "approve" && draft !== undefined ? draft : item.draft,
      reasons: extraReasons.length ? [...item.reasons, ...extraReasons] : item.reasons,
      status: action === "approve" ? ("approved" as const) : ("rejected" as const),
      resolvedAt: nowIso,
      resolvedBy: resolvedBy ?? "case-manager",
    };
    await putInboxItem(next);
    return NextResponse.json({ ok: true, item: next, executed: executed ?? null });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
