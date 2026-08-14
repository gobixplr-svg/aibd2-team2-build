// POST /api/inbox — create an approval item from a human action on the
// portal (request reroute, draft family message). Hermes creates its own
// items inside tick(); this is the human-initiated path.

import { NextResponse } from "next/server";
import type { ActionTier, InboxItem } from "@/lib/contracts";
import { putInboxItem } from "@/lib/data/db";
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
    const item: InboxItem = {
      id: `inbox-${Date.now().toString(36)}`,
      createdAt: new Date(now).toISOString(),
      tier: body.tier ?? "consequential",
      orderId: body.orderId,
      patientId: body.patientId,
      title: body.title,
      detail: body.detail,
      reasons: [],
      reasonCodes: [],
      proposedAction: body.proposedAction ?? "manual",
      status: "pending",
      source: body.source,
      draft: body.draft,
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
