// POST /api/on-hand/[id] — advance a consignment asset one step through
// its lifecycle (build-plan item 10). One legal next state per current
// state — a single cycle, nothing to pick except when the next state is
// "deployed", which needs a patientId.
//
//   { action: "advance" }
//   { action: "advance", patientId }   — required entering "deployed"

import { NextResponse } from "next/server";
import { appendEvent, getOnHandAsset, putOnHandAsset } from "@/lib/data/db";
import { engineNow } from "@/lib/engine/clock";
import { ON_HAND_CYCLE } from "@/lib/contracts";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: RouteContext<"/api/on-hand/[id]">) {
  try {
    const { id } = await ctx.params;
    const { action, patientId } = (await req.json()) as {
      action: "advance";
      patientId?: string;
    };

    if (action !== "advance") {
      return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
    }

    const asset = await getOnHandAsset(id);
    if (!asset) {
      return NextResponse.json({ ok: false, error: "unknown asset" }, { status: 404 });
    }

    const next = ON_HAND_CYCLE[asset.state];
    if (next === "deployed" && !patientId) {
      return NextResponse.json(
        { ok: false, error: "deploying an on-hand asset needs a patientId" },
        { status: 400 },
      );
    }

    const now = await engineNow();
    const nowIso = new Date(now).toISOString();
    // Patient link starts at deploy and rides through the return trip —
    // useful context for "whose commode is this, mid-return." It clears
    // once the asset is actually back in general stock.
    const clearsPatient = next === "maintenance" || next === "at_warehouse";
    const updated = {
      ...asset,
      state: next,
      patientId: next === "deployed" ? patientId : clearsPatient ? undefined : asset.patientId,
      updatedAt: nowIso,
    };
    await putOnHandAsset(updated);
    await appendEvent({
      meta: { eventType: "onHandAssetAdvanced", at: nowIso },
      account: { identifiers: [{ id: asset.id }] },
      payload: { assetId: asset.id, from: asset.state, to: next, patientId: updated.patientId },
    });

    return NextResponse.json({ ok: true, asset: updated });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
