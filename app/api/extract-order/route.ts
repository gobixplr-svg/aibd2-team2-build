// POST /api/extract-order — paste referral text, get a draft order.
//
// Server-side so the Anthropic key never reaches the browser. Reads
// the census itself (the client shouldn't get to say who's on it),
// meters the call into the token ledger, and returns the draft. It
// never writes an order — the human confirms in the modal and the
// modal still POSTs /api/orders.

import { NextResponse } from "next/server";
import { extractOrder } from "@/lib/ai/extract-order";
import { appendLedger, getPatients } from "@/lib/data/db";

export const dynamic = "force-dynamic";

const MAX_CHARS = 8000; // a referral, not a chart dump

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { text?: string };
    const text = body.text?.trim();
    if (!text) {
      return NextResponse.json(
        { ok: false, error: "text required" },
        { status: 400 },
      );
    }
    const patients = (await getPatients())
      .filter((p) => p.status !== "deceased")
      .map((p) => ({ id: p.id, label: p.label }));

    const draft = await extractOrder(text.slice(0, MAX_CHARS), patients);
    if (draft.ledger) await appendLedger(draft.ledger);

    return NextResponse.json({ ok: true, draft });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
