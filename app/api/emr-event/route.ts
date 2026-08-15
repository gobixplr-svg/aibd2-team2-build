// POST /api/emr-event — the EMR simulator's webhook. Mimics the ADT
// partner-connection pattern (HCHB / MatrixCare / Netsmart): a patient
// status change lands, and if it's a death, pickup auto-triggers on the
// patient's delivered equipment (triggeredBy: "emr" — the FALLBACK path;
// the nurse tap remains primary and uses /api/orders/[id]/transition).
//   { patientId, status: "admitted" | "discharged" | "deceased" }

import { NextResponse } from "next/server";
import { getLiveOrders, getPatient, getWorld, putPatient, appendEvent } from "@/lib/data/db";
import { applyTransition, patientStatusEvent, pickupPatch } from "@/lib/engine/transition";
import { engineNow } from "@/lib/engine/clock";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { patientId, status, source } = (await req.json()) as {
      patientId: string;
      status: "admitted" | "discharged" | "deceased";
      source?: "nurse" | "emr";
    };
    const by = source ?? "emr";
    const patient = await getPatient(patientId);
    if (!patient) {
      return NextResponse.json({ ok: false, error: "unknown patient" }, { status: 404 });
    }
    const now = await engineNow();
    await putPatient({
      ...patient,
      status: status === "admitted" ? "active" : status === "discharged" ? "discharged" : "deceased",
    });
    await appendEvent(patientStatusEvent(patientId, status, now, by));

    let pickupsTriggered = 0;
    if (status === "deceased") {
      const world = await getWorld();
      // Live orders only — a death must never trigger pickups on ord-h
      // historical seeds (p1-p15 all carry them now).
      const orders = await getLiveOrders();
      for (const o of orders.filter(
        (o) => o.patientId === patientId && o.state === "delivered",
      )) {
        await applyTransition(
          o.id,
          "pickup_triggered",
          now,
          pickupPatch(now, by, world.policy.pickupSlaHours),
          "pickupTriggered",
        );
        pickupsTriggered++;
      }
    }
    return NextResponse.json({ ok: true, pickupsTriggered });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
