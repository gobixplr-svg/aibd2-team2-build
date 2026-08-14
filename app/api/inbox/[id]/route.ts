// POST /api/inbox/[id] — resolve an approval-inbox item.
//   { action: "approve" | "reject", resolvedBy?: string }
// Approving a Hermes-proposed action only records the decision for now;
// executing proposedAction server-side is Will's follow-up (flagged).

import { NextResponse } from "next/server";
import { getInbox, putInboxItem } from "@/lib/data/db";
import { engineNow } from "@/lib/engine/clock";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: RouteContext<"/api/inbox/[id]">) {
  try {
    const { id } = await ctx.params;
    const { action, resolvedBy } = (await req.json()) as {
      action: "approve" | "reject";
      resolvedBy?: string;
    };
    const item = (await getInbox()).find((i) => i.id === id);
    if (!item) return NextResponse.json({ ok: false, error: "unknown item" }, { status: 404 });
    const now = await engineNow();
    const next = {
      ...item,
      status: action === "approve" ? ("approved" as const) : ("rejected" as const),
      resolvedAt: new Date(now).toISOString(),
      resolvedBy: resolvedBy ?? "case-manager",
    };
    await putInboxItem(next);
    return NextResponse.json({ ok: true, item: next });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
