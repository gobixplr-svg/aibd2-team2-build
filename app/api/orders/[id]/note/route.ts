// POST /api/orders/[id]/note — per-order note (Garrett's portal, #10's
// audit-trail item in miniature). Note-only change, no state transition.

import { NextResponse } from "next/server";
import { getOrder, putOrder } from "@/lib/data/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: RouteContext<"/api/orders/[id]/note">) {
  try {
    const { id } = await ctx.params;
    const { note } = (await req.json()) as { note: string };
    const order = await getOrder(id);
    if (!order) return NextResponse.json({ ok: false, error: "unknown order" }, { status: 404 });
    await putOrder({ ...order, note });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
