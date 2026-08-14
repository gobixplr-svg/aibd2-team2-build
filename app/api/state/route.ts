// GET /api/state — the one endpoint Dan and Garrett consume.
//
// Polled, not streamed. With two devices on a conference network and
// five minutes that decide the bounty, a poll that silently retries
// beats a socket that silently dies.
//
//   /api/state                  everything
//   /api/state?scope=hospice    board + inbox + cost
//   /api/state?scope=vendor&token=demo-vendor   that vendor's queue only
//   /api/state?scope=family&token=demo-family   one patient, read-only
//
// `now` in the response is ENGINE time, not wall time. Render from it
// so the UI agrees with the clock the risk math used.

import { NextResponse } from "next/server";
import {
  getCalibration,
  getInbox,
  getLedger,
  getMessages,
  getOrders,
  getPatients,
  getVendors,
  isPersistent,
} from "@/lib/data/db";
import { engineNowWithWorld } from "@/lib/engine/clock";
import { dailyRateUsd } from "@/lib/data/catalog";

export const dynamic = "force-dynamic";

const H = 3_600_000;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get("scope") ?? "all";
    const token = searchParams.get("token");

    const { now, world } = await engineNowWithWorld();
    const [orders, vendors, patients, inbox, ledger, messages] = await Promise.all([
      getOrders(),
      getVendors(),
      getPatients(),
      getInbox(),
      getLedger(200),
      getMessages(),
    ]);

    // Historical orders exist for vendor stats, not for rendering.
    const live = orders.filter((o) => !o.id.startsWith("ord-h"));

    const base = {
      ok: true,
      now: new Date(now).toISOString(),
      clock: world.clock,
      policy: world.policy,
      lastTickAt: world.lastTickAt ?? null,
      persistent: isPersistent,
    };

    if (scope === "vendor") {
      const vendor = vendors.find((v) => v.token === token);
      if (!vendor) {
        return NextResponse.json(
          { ok: false, error: "unknown vendor token" },
          { status: 404 },
        );
      }
      return NextResponse.json({
        ...base,
        vendor,
        orders: live.filter((o) => o.vendorId === vendor.id),
      });
    }

    if (scope === "family") {
      const patient = patients.find((p) => p.familyToken === token);
      if (!patient) {
        return NextResponse.json(
          { ok: false, error: "unknown family token" },
          { status: 404 },
        );
      }
      const mine = live.filter((o) => o.patientId === patient.id);
      // Deliberately thin. The family page is calm by design — no risk
      // scores, no vendor names, no status noise.
      return NextResponse.json({
        ...base,
        patient,
        orders: mine.map((o) => ({
          id: o.id,
          state: o.state,
          items: o.items.map((i) => i.name),
          targetAt: o.targetAt,
          etaAt: o.etaAt,
          pickup: o.pickup ? { dueAt: o.pickup.dueAt } : undefined,
        })),
      });
    }

    // ── Money counter ────────────────────────────────────────
    // Every hour a rental sits in the home after death is a day the
    // hospice keeps paying. Real CMS rates, real elapsed time — the
    // COO's own complaint, turned into a number.
    const overdueUsd = live
      .filter((o) => o.pickup && !o.pickup.completedAt)
      .reduce((sum, o) => {
        const due = new Date(o.pickup!.dueAt).getTime();
        if (now <= due) return sum;
        const extraDays = Math.ceil((now - due) / (24 * H));
        return (
          sum +
          extraDays * o.items.reduce((s, i) => s + dailyRateUsd(i.hcpcs), 0)
        );
      }, 0);

    const costUsd = ledger.reduce((s, e) => s + e.costUsd, 0);
    const tokens = ledger.reduce((s, e) => s + e.inputTokens + e.outputTokens, 0);

    const payload = {
      ...base,
      orders: live,
      vendors,
      patients,
      inbox: inbox.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      messages: messages.sort((a, b) =>
        b.receivedAt.localeCompare(a.receivedAt),
      ),
      cost: {
        totalUsd: Number(costUsd.toFixed(4)),
        tokens,
        calls: ledger.length,
        // Sum the orders each call actually covered — a batched triage of
        // four orders is four orders, not one.
        ordersCovered: ledger.reduce((s, e) => s + (e.orderCount ?? 1), 0),
        perOrderUsd: (() => {
          const n = ledger.reduce((s, e) => s + (e.orderCount ?? 1), 0);
          return n ? Number((costUsd / n).toFixed(5)) : 0;
        })(),
      },
      money: { pickupOverdueUsd: Number(overdueUsd.toFixed(2)) },
      calibration: await getCalibration(),
    };

    if (scope === "hospice") return NextResponse.json(payload);
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
