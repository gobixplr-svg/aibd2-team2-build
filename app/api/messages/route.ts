// POST /api/messages — a family texts the hospice.
//
//   { "patientId": "p1", "body": "the wheelchair has a screw sticking out",
//     "from": "daughter" }
//
// Classifies, stores, and drops a routed item in the same inbox the risk
// engine writes to — so a 9 PM Friday text lands next to everything else
// a nurse would look at, instead of in a voicemail nobody hears until
// Monday. That "nationals only work nine to five" gap, from the family's
// side rather than the vendor's.
//
// GET returns the message log with its triage, for the family surface.

import { NextResponse } from "next/server";
import type { InboundMessage, InboxItem } from "@/lib/contracts";
import {
  appendLedger,
  getMessages,
  getOrders,
  getPatients,
  getWorld,
  putInboxItem,
  putMessage,
} from "@/lib/data/db";
import { engineNow } from "@/lib/engine/clock";
import {
  contextFor,
  tierForMessageAction,
  triageMessage,
} from "@/lib/engine/triage-message";

export const dynamic = "force-dynamic";

const TITLES: Record<string, string> = {
  dispatch_replacement: "Replace equipment",
  escalate_on_call_nurse: "On-call nurse needed",
  expedite_pickup: "Family asking for pickup",
  answer_from_status: "Family question",
  reply_needs_human: "Family message",
};

export async function POST(req: Request) {
  try {
    const { patientId, body, from, orderId } = (await req.json()) as {
      patientId: string;
      body: string;
      from?: string;
      orderId?: string; // the order the family was looking at when they sent it
    };

    if (!patientId || !body?.trim()) {
      return NextResponse.json(
        { ok: false, error: "patientId and body are required" },
        { status: 400 },
      );
    }

    const [world, patients, orders] = await Promise.all([
      getWorld(),
      getPatients(),
      getOrders(),
    ]);
    const patient = patients.find((p) => p.id === patientId);
    if (!patient) {
      return NextResponse.json(
        { ok: false, error: "unknown patient" },
        { status: 404 },
      );
    }

    const now = await engineNow();
    const iso = new Date(now).toISOString();
    // Live orders only. The board suppresses pending inbox items whose
    // order isn't on the live board — attaching to an ord-h historical
    // seed makes the family's message silently vanish from the tray.
    const mine = orders.filter(
      (o) => o.patientId === patientId && !o.id.startsWith("ord-h"),
    );
    // Prefer the order the family was actually looking at.
    const attachedOrderId =
      orderId && mine.some((o) => o.id === orderId) ? orderId : mine[0]?.id;

    // Same toggle as the risk engine, so the rules-only demo covers this
    // path too — and the keyword baseline is visibly worse at exactly the
    // job the model is good at.
    const { triage, ledger } = await triageMessage(
      body,
      contextFor(patient.label, mine),
      world.policy.useAiTriage,
    );
    if (ledger) await appendLedger(ledger);

    const message: InboundMessage = {
      id: `msg-${now}`,
      patientId,
      patientLabel: patient.label,
      from,
      body,
      receivedAt: iso,
      triage,
    };
    await putMessage(message);

    // Low confidence never gets a machine's oversight level, whatever the
    // action says. A keyword fallback is 0.4 by construction, so it always
    // reaches a person.
    const tier =
      triage.confidence >= 0.7
        ? tierForMessageAction(triage.recommendedAction)
        : "human_facing";

    const item: InboxItem = {
      id: `inbox-msg-${now}`,
      createdAt: iso,
      tier,
      patientId,
      orderId: attachedOrderId,
      title: `${TITLES[triage.recommendedAction] ?? "Family message"} — ${patient.label}`,
      detail: `"${body.trim()}"`,
      reasons: [
        `${triage.safetyFlag ? "SAFETY · " : ""}${triage.category.replace(/_/g, " ")} · ${triage.urgency.replace(/_/g, " ")}`,
        `${triage.aiUsed ? "Hermes triage" : "Keyword fallback"} (confidence ${triage.confidence.toFixed(2)}): ${triage.rationale}`,
      ],
      reasonCodes: [],
      proposedAction: triage.recommendedAction,
      // Nothing inbound auto-executes. A person always sees the family's
      // words before anything happens on their behalf.
      status: "pending",
      silent: false,
      source: "family_message",
    };
    await putInboxItem(item);

    return NextResponse.json({ ok: true, message, inbox: item });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function GET() {
  const messages = await getMessages();
  return NextResponse.json({
    ok: true,
    messages: messages.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)),
  });
}
