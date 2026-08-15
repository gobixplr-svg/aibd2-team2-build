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
//
// After the tick, this wrapper enriches any human_facing inbox items
// with a Claude family-message draft. Deliberately HERE and not in
// tick.ts: the engine stays deterministic-plus-one-triage-call (Will's
// invariant), and the words a family reads are prepared at the edge,
// where a failure costs a template instead of a heartbeat.

import { NextResponse } from "next/server";
import { draftFamilyMessage } from "@/lib/ai/draft-note";
import { appendLedger, getInbox, getOrder, putInboxItem } from "@/lib/data/db";
import { engineNow } from "@/lib/engine/clock";
import { tick } from "@/lib/engine/tick";
import { hermesAuthorized } from "@/lib/hermes-auth";

export const dynamic = "force-dynamic";

// Bound the extra latency a tick can pick up: drafts are only needed
// for what a nurse is about to read, and the next tick catches strays.
const MAX_DRAFTS_PER_TICK = 3;

async function enrichFamilyDrafts(): Promise<number> {
  const inbox = await getInbox();
  const needing = inbox
    .filter(
      (i) =>
        i.source === "hermes" &&
        i.tier === "human_facing" &&
        i.status === "pending" &&
        !i.draft &&
        i.orderId,
    )
    .slice(0, MAX_DRAFTS_PER_TICK);

  let written = 0;
  for (const item of needing) {
    const order = await getOrder(item.orderId!);
    if (!order) continue;
    const result = await draftFamilyMessage({
      patientLabel: order.patientLabel,
      kind:
        item.proposedAction === "family_pickup_heads_up"
          ? "pickup_heads_up"
          : order.pickup
            ? "pickup_update"
            : "general_update",
      equipment: order.items.map((i) => i.name),
      windowStart: order.pickup?.windowStart ?? null,
      windowEnd: order.pickup?.windowEnd ?? null,
      orderId: order.id,
    });
    await putInboxItem({ ...item, draft: result.text });
    if (result.ledger) await appendLedger(result.ledger);
    written += 1;
  }
  return written;
}

export async function POST(req: Request) {
  if (!hermesAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  try {
    const now = await engineNow();
    const result = await tick(now);
    // Draft failures must never fail the heartbeat — the template
    // inside draftFamilyMessage is the floor, and this catch is the
    // floor under the floor.
    const familyDrafts = await enrichFamilyDrafts().catch(() => 0);
    return NextResponse.json({ ok: true, ...result, familyDrafts });
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
