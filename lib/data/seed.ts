// ─────────────────────────────────────────────────────────────
// Deterministic seed generator. Owned by Will (engine lane).
// Supersedes stub-seed.ts — same ids, tokens, labels and addresses,
// so /board, /v/[token], /f/[token] and /emr render identically.
//
// Two rules this file obeys, both load-bearing:
//
//  1. NO Math.random(). A fixed PRNG means the demo is the same run
//     every time. `POST /api/reset` + rehearse is only useful if the
//     world comes back identical.
//  2. NO Date.now(). `buildSeed(nowMs)` takes time as a parameter,
//     exactly like tick(now). The demo clock feeds it accelerated
//     time and everything downstream still lines up.
//
// Distributions come from docs — prep/betterrx/cms-data-notes.md,
// pulled from the CMS Medicare DME PUF and Hospice PUF. Where we
// guessed, the constant says so.
// ─────────────────────────────────────────────────────────────

import type { OnHandAsset, OnHandState, Order, OrderItem, Patient, Vendor } from "@/lib/contracts";
import { EQUIPMENT } from "@/lib/data/catalog";

// ── Deterministic PRNG (mulberry32) ──────────────────────────

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 20260814; // build date. Change it and the demo changes.

function pick<T>(r: () => number, xs: readonly T[]): T {
  return xs[Math.floor(r() * xs.length)];
}

/** Weighted pick. weights need not sum to 1. */
function weighted<T>(r: () => number, xs: readonly [T, number][]): T {
  const total = xs.reduce((s, [, w]) => s + w, 0);
  let n = r() * total;
  for (const [x, w] of xs) {
    if ((n -= w) <= 0) return x;
  }
  return xs[xs.length - 1][0];
}

const H = 3_600_000;
const D = 24 * H;
const iso = (ms: number) => new Date(ms).toISOString();

// Equipment rates live in lib/data/catalog.ts — one table, shared with
// the order form, so the board's cost estimate and the engine's money
// counter can never print different dollars for the same order.

const item = (hcpcs: string, assetId?: string): OrderItem => ({
  hcpcs,
  name: EQUIPMENT[hcpcs].name,
  ...(assetId ? { assetId } : {}),
});

// ── Diagnosis mix (CMS Hospice PUF FY2024) ───────────────────
// Drives equipment mix per patient — respiratory/circulatory skew
// oxygen, neuro skews beds and pressure mattresses.

type Dx = "circulatory" | "neuro" | "cancer" | "respiratory" | "endocrine";

const DX_MIX: [Dx, number][] = [
  ["circulatory", 31],
  ["neuro", 26],
  ["cancer", 23],
  ["respiratory", 10],
  ["endocrine", 4],
];

const DX_EQUIP: Record<Dx, [string, number][]> = {
  respiratory: [["E1390", 45], ["E0431", 20], ["E0470", 15], ["E0601", 10], ["E0260", 10]],
  circulatory: [["E1390", 30], ["E0260", 25], ["E0601", 15], ["K0001", 15], ["E0163", 15]],
  neuro: [["E0260", 35], ["K0001", 25], ["E0277", 15], ["E0143", 15], ["E0163", 10]],
  cancer: [["E0260", 30], ["E0277", 20], ["E0163", 20], ["E1390", 20], ["E0143", 10]],
  endocrine: [["K0001", 30], ["E0143", 30], ["E0260", 20], ["E0163", 20]],
};

// ── Medication spend, by diagnosis (guessed — see file header rule) ──
// The Medicare Hospice Benefit bundles most drug costs into the per-diem
// rate, so there's no clean CMS PUF line item to cite here the way there
// is for DME. These ranges are a guess at relative symptom-management
// intensity by diagnosis (cancer skews highest — pain/nausea management;
// endocrine lowest), synthetic stand-in for what a real BetterRX eRx feed
// would report. Required by the bounty's own Required Features list:
// "Total cost-of-care visibility. DME spend alongside medication spend,
// not in a separate silo."
const RX_MONTHLY_RANGE: Record<Dx, [number, number]> = {
  cancer: [1500, 3200],
  neuro: [900, 2200],
  respiratory: [700, 1800],
  circulatory: [600, 1600],
  endocrine: [500, 1400],
};

// ── Vendors ──────────────────────────────────────────────────
// v1/v2 keep the ids, tokens and names the vendor + family pages
// already resolve against. v3 is the reroute target — beat 3 needs
// somewhere to send the order.
//
// The story lives in the stats: Great Basin looks fine overall
// (88% on-time) and is quietly failing STAT specifically (74%).
// That gap is the thing a flat threshold cannot see and the model
// can — the brief's own example of AI earning its place ("a
// specific vendor's on-time rate degrading for a specific order
// type"). The seeded history below reproduces it honestly.

export function buildVendors(): Vendor[] {
  return [
    {
      id: "v1",
      token: "demo-vendor",
      name: "Wasatch Medical Supply",
      connected: true,
      serviceArea: "Salt Lake / Utah County",
      stats: { onTimeRate: 0.94, statOnTimeRate: 0.91, avgPickupHours: 19, podCompleteness: 0.97 },
    },
    {
      id: "v2",
      token: "demo-vendor-2",
      name: "Great Basin DME",
      connected: false, // tracked by Handoff, not in-app: escalation goes to a case manager with a phone script
      serviceArea: "Salt Lake / Tooele",
      stats: { onTimeRate: 0.88, statOnTimeRate: 0.74, avgPickupHours: 31, podCompleteness: 0.74 },
    },
    {
      id: "v3",
      token: "demo-vendor-3",
      name: "Timpanogos DME",
      connected: true,
      serviceArea: "Utah County",
      stats: { onTimeRate: 0.91, statOnTimeRate: 0.89, avgPickupHours: 22, podCompleteness: 0.93 },
    },
  ];
}

// ── Patients ─────────────────────────────────────────────────
// p1 and p4 keep their family tokens — /f/[token] resolves them.
// p2, p3, p5, p6 keep the labels the stub orders referenced.

// p1–p15 are the original set — buildLiveOrders, on-hand assets and the
// family-token demo beats all index into these by id, so they keep their
// exact position. p16+ are appended-only, for analytics volume — never
// insert or reorder above this line.
const NAMES = [
  "M. Checketts", "R. Okafor", "L. Sorensen", "D. Whitmer", "J. Maughan",
  "A. Petrov", "E. Tanaka", "B. Halvorsen", "C. Ruiz", "N. Abbasi",
  "G. Lindqvist", "S. Mwangi", "T. Bianchi", "H. Nakamura", "P. Oyelaran",
  // ── p16–p45: analytics volume ──
  "K. Sandoval", "F. Kowalski", "V. Ngata", "W. Larsen", "M. Delacroix",
  "O. Fetzer", "I. Hovland", "Y. Castellanos", "R. Whitfield", "A. Okonkwo",
  "L. Berglund", "T. Marchetti", "S. Yazzie", "D. Kallenberger", "N. Osei",
  "C. Wentzel", "P. Aguayo", "E. Skousen", "H. Duvall", "B. Ferreira",
  "J. Christoffersen", "G. Manwaring", "Q. Alvarado", "Z. Huntsman", "M. Rasmussen",
  "K. Beaumont", "R. Ah Quin", "L. Vukovic", "D. Espinoza", "T. Hafen",
];

const ADDRESSES = [
  "1483 E Aspen Way, Sandy", "742 W Fort Union Blvd, Midvale",
  "88 S 900 E, Salt Lake City", "3310 S Redwood Rd, West Valley",
  "9120 S 700 E, Sandy", "455 E 3300 S, Salt Lake City",
  "215 N Main St, Bountiful", "1780 W 7800 S, West Jordan",
  "620 E Pages Ln, Centerville", "3045 S Highland Dr, Millcreek",
  "1102 E Vine St, Murray", "580 N 500 W, Provo",
  "2233 S State St, South Salt Lake", "77 W Center St, Orem",
  "4410 S 2700 W, Taylorsville",
  // ── p16–p45 ──
  "212 W 400 N, Provo", "6650 S 1300 E, Salt Lake City",
  "890 E State St, American Fork", "1455 W 12600 S, Riverton",
  "77 N 200 W, Layton", "3200 W 5400 S, Taylorsville",
  "540 E Gordon Ave, Layton", "925 S Main St, Bountiful",
  "2100 N 1200 W, Farmington", "310 W 800 S, Salt Lake City",
  "8940 S Sandy Pkwy, Sandy", "1560 E 3900 S, Holladay",
  "745 N 300 E, Lehi", "2233 W 9000 S, West Jordan",
  "410 S 200 E, Kaysville", "6120 S Wasatch Blvd, Cottonwood Heights",
  "870 N Freedom Blvd, Provo", "1340 E Center St, Spanish Fork",
  "455 W 100 S, Ogden", "2870 S Redwood Rd, West Valley",
  "150 E Main St, Herriman", "3390 W 3500 S, West Valley",
  "1122 S 500 E, Salt Lake City", "6780 S Highland Dr, Cottonwood Heights",
  "220 N Main St, Tooele", "980 W 1700 S, Salt Lake City",
  "1450 E 4500 S, Millcreek", "375 N 900 W, Provo",
  "2640 S 4000 W, West Valley", "715 E 700 N, Bountiful",
];

export interface SeededPatient extends Patient {
  dx: Dx;
  address: string;
}

export function buildPatients(): SeededPatient[] {
  const r = rng(SEED);
  return NAMES.map((label, i) => {
    const dx = weighted(r, DX_MIX);
    const [rxLow, rxHigh] = RX_MONTHLY_RANGE[dx];
    const rxSpendMonthly = Math.round(rxLow + r() * (rxHigh - rxLow));
    const id = `p${i + 1}`;
    return {
      id,
      label,
      dx,
      rxSpendMonthly,
      address: ADDRESSES[i],
      // p1 is the live discharge, p4 is the deceased pickup — both
      // have family pages in the demo click-path.
      ...(id === "p1" ? { familyToken: "demo-family" } : {}),
      ...(id === "p4" ? { familyToken: "demo-family-2" } : {}),
      // p7 and p9 are the other two pickups — p7 on a slow vendor so
      // predicted-breach is visible, p9 urgent so the two ladder speeds
      // can be shown side by side.
      ...(id === "p7" ? { familyToken: "demo-family-3" } : {}),
      status:
        id === "p4" || id === "p7" || id === "p9"
          ? ("deceased" as const)
          : ("active" as const),
    };
  });
}

// ── Live orders ──────────────────────────────────────────────
// The six the demo actually walks through. Ids, patients, addresses
// and relative timings match stub-seed.ts exactly — the surfaces
// look the same, the data is now real and shared across devices.
//
// Deliberately NO pre-baked `risk` on ord-1003. The stub hardcoded
// one; the engine has to earn it on a real tick, or the runbook's
// "nothing is hardcoded to fire on cue" is a lie.

export function buildLiveOrders(now: number): Order[] {
  return [
    {
      id: "ord-1001",
      patientId: "p1",
      patientLabel: "M. Checketts",
      address: "1483 E Aspen Way, Sandy",
      items: [item("E0260"), item("E1390")],
      urgency: "stat",
      vendorId: "v1",
      targetAt: iso(now + 3 * H),
      state: "ordered",
      note: "Discharge home today 4:30 PM — bed must be in place first.",
      timestamps: { ordered: iso(now) },
    },
    {
      id: "ord-1002",
      patientId: "p2",
      patientLabel: "R. Okafor",
      address: "742 W Fort Union Blvd, Midvale",
      items: [item("E0601")],
      urgency: "routine",
      vendorId: "v1",
      targetAt: iso(now + 26 * H),
      state: "ordered",
      timestamps: { ordered: iso(now) },
    },
    {
      id: "ord-0997",
      patientId: "p3",
      patientLabel: "L. Sorensen",
      address: "88 S 900 E, Salt Lake City",
      items: [item("E1130", "WMS-W-0331")],
      urgency: "routine",
      vendorId: "v1",
      targetAt: iso(now + 5 * H),
      state: "in_transit",
      etaAt: iso(now + 0.5 * H),
      timestamps: {
        ordered: iso(now - 4 * H),
        dispatched: iso(now - 2 * H),
        in_transit: iso(now - 1 * H),
      },
    },
    {
      // Beat 3. Dispatched to an UNCONNECTED vendor, then silence.
      // No risk flag here on purpose — tick() has to find it.
      id: "ord-1003",
      patientId: "p5",
      patientLabel: "J. Maughan",
      address: "9120 S 700 E, Sandy",
      items: [item("E0431")],
      urgency: "stat",
      vendorId: "v2",
      targetAt: iso(now + 1.5 * H),
      state: "dispatched",
      etaAt: iso(now + 2.4 * H), // 54 min past the deadline
      timestamps: {
        ordered: iso(now - 1 * H),
        dispatched: iso(now - 0.8 * H),
      },
    },
    {
      id: "ord-0988",
      patientId: "p6",
      patientLabel: "A. Petrov",
      address: "455 E 3300 S, Salt Lake City",
      items: [item("E0143", "WMS-K-0912")],
      urgency: "routine",
      vendorId: "v1",
      targetAt: iso(now - 20 * H),
      state: "delivered",
      pod: {
        signedBy: "T. Petrov (daughter)",
        at: iso(now - 21 * H),
        condition: { clean: true, functional: true, complete: true },
      },
      timestamps: { ordered: iso(now - 44 * H), delivered: iso(now - 21 * H) },
    },
    {
      // Beat 6. Pickup triggered by the nurse in the home; the 24h
      // SLA is still running. Advance the clock and it ages past.
      id: "ord-0961",
      patientId: "p4",
      patientLabel: "D. Whitmer",
      address: "3310 S Redwood Rd, West Valley",
      items: [item("E0260", "WMS-B-1147")],
      urgency: "routine",
      vendorId: "v1",
      targetAt: iso(now - 30 * H),
      state: "pickup_triggered",
      note: "Patient passed yesterday evening. Family present — call ahead.",
      pickup: {
        triggeredAt: iso(now - 5 * H),
        triggeredBy: "nurse",
        dueAt: iso(now - 5 * H + 24 * H), // 24h SLA — hospice pays until retrieval
      },
      timestamps: {
        ordered: iso(now - 31 * D),
        delivered: iso(now - 30 * D),
        pickup_triggered: iso(now - 5 * H),
      },
    },
    {
      // The predicted-breach case. Triggered only an hour ago and not
      // late by any measure — but it's assigned to Great Basin, whose
      // measured average retrieval is 31h against a 24h window. Hermes
      // knows at T+0 that this one misses, and can still swap it.
      //
      // This is "it sees the failure coming" with nothing yet wrong.
      id: "ord-0974",
      patientId: "p7",
      patientLabel: "E. Tanaka",
      address: "215 N Main St, Bountiful",
      items: [item("E1390", "GBD-O-0442"), item("E0277", "GBD-M-0119")],
      urgency: "routine",
      vendorId: "v2",
      targetAt: iso(now - 12 * D),
      state: "pickup_triggered",
      note: "Patient passed this morning. Daughter is at the house today.",
      pickup: {
        triggeredAt: iso(now - 1 * H),
        triggeredBy: "nurse",
        dueAt: iso(now - 1 * H + 24 * H),
      },
      timestamps: {
        ordered: iso(now - 13 * D),
        delivered: iso(now - 12 * D),
        pickup_triggered: iso(now - 1 * H),
      },
    },
    {
      // URGENT pickup. Same equipment, same 40 minutes of vendor
      // silence — but a 4h window instead of 24h, so 40 minutes is 17%
      // of the time available rather than 3%. The ladder escalates in
      // minutes here and in hours on the routine one, from one rule.
      //
      // Real reasons a retrieval is urgent: a small home where the bed
      // blocks the only path to the bathroom, infection control, or
      // another patient waiting on that serialized asset.
      id: "ord-0977",
      patientId: "p9",
      patientLabel: "C. Ruiz",
      address: "620 E Pages Ln, Centerville",
      items: [item("E0260", "GBD-B-0781")],
      urgency: "stat",
      vendorId: "v2",
      targetAt: iso(now - 6 * D),
      state: "pickup_triggered",
      note: "Bed blocks the only route to the bathroom. Family asked twice.",
      pickup: {
        triggeredAt: iso(now - 0.7 * H),
        triggeredBy: "nurse",
        urgency: "stat",
        dueAt: iso(now - 0.7 * H + 4 * H), // 4h urgent window
      },
      timestamps: {
        ordered: iso(now - 7 * D),
        delivered: iso(now - 6 * D),
        pickup_triggered: iso(now - 0.7 * H),
      },
    },
  ];
}

// ── Historical orders ────────────────────────────────────────
// A full year (365 days), ~1,100 completed rental episodes across 45
// patients and 3 vendors. These are never rendered on the live board —
// /api/state keeps them out of `orders` (id prefix ord-h) — but
// Analytics reads them (see `history` in the hospice payload) for
// month-over-month spend, category mix, and vendor comparison. Volume
// bumped from the original ~50/90-day set specifically so those charts
// have enough density per vendor × category × month to read as real
// reporting rather than three bars and a shrug.
//
// Each episode gets a bounded rental cycle (delivered → pickup
// completed) so "days on DME" and monthly spend are finite, realistic
// numbers instead of growing every day the demo stays up — an order
// with no pickup.completedAt accrues rent against `now` forever, which
// is correct for equipment still out today but wrong for something
// delivered 300 days ago that obviously isn't still in the home.

const VENDOR_PROFILE: Record<
  string,
  { routineOnTime: number; statOnTime: number; statTrendPerDay: number }
> = {
  // Great Basin's STAT performance decays across the window. That
  // decay is the pattern risk-v2 is supposed to surface before a
  // flat threshold would ever fire.
  v1: { routineOnTime: 0.96, statOnTime: 0.93, statTrendPerDay: 0 },
  v2: { routineOnTime: 0.93, statOnTime: 0.9, statTrendPerDay: -0.0035 },
  v3: { routineOnTime: 0.93, statOnTime: 0.9, statTrendPerDay: 0 },
};

export function buildHistory(now: number, patients: SeededPatient[]): Order[] {
  const r = rng(SEED + 1);
  const out: Order[] = [];
  const COUNT = 1100;
  const WINDOW_DAYS = 365;
  const vendorsById = new Map(buildVendors().map((v) => [v.id, v]));

  for (let i = 0; i < COUNT; i++) {
    const daysAgo = 1 + Math.floor(r() * (WINDOW_DAYS - 1));
    const orderedAt = now - daysAgo * D;
    const patient = pick(r, patients);
    const vendorId = weighted(r, [
      ["v1", 55],
      ["v2", 30],
      ["v3", 15],
    ]);
    const urgency = r() < 0.35 ? "stat" : "routine";
    const hcpcs = weighted(r, DX_EQUIP[patient.dx]);

    const slaH = urgency === "stat" ? 8 : 24;
    const targetAt = orderedAt + slaH * H;

    const p = VENDOR_PROFILE[vendorId];
    // The STAT-decay trend only applies within the most recent 90
    // days (the demo's calibration window) — clamp so an order from
    // eight months ago reads against the vendor's flat baseline
    // instead of the trend formula running away over a full year.
    const trendWindow = Math.min(daysAgo, 90);
    const onTimeP =
      urgency === "stat"
        ? p.statOnTime + p.statTrendPerDay * (90 - trendWindow)
        : p.routineOnTime;

    const onTime = r() < onTimeP;
    const deliveredAt = onTime
      ? targetAt - r() * 3 * H
      : targetAt + (0.4 + r() * 5) * H;

    // Rental length: 8–43 days is the realistic range for a hospice DME
    // placement that ends in either a pickup or a swap. If that would
    // push the pickup into the future, leave it off — the equipment is
    // still out, which is the honest state for anything delivered
    // recently.
    const rentalDays = 8 + r() * 35;
    const triggeredAt = deliveredAt + rentalDays * D;
    // Retrieval wait: mirrors the vendor's measured avgPickupHours,
    // with real spread — some pickups run past the 24h SLA, which is
    // what gives "post-pickup idle days" real historical texture too.
    const pickupWaitH = (vendorsById.get(vendorId)?.stats?.avgPickupHours ?? 24) * (0.4 + r() * 1.3);
    const completedAt = triggeredAt + pickupWaitH * H;

    out.push({
      id: `ord-h${900 + i}`,
      patientId: patient.id,
      patientLabel: patient.label,
      address: patient.address,
      items: [item(hcpcs)],
      urgency,
      vendorId,
      targetAt: iso(targetAt),
      state: "delivered",
      etaAt: iso(deliveredAt),
      pod: {
        at: iso(deliveredAt),
        signedBy: "on file",
        condition: {
          clean: true,
          functional: true,
          // Great Basin's POD completeness gap is real in the data too.
          complete: r() < (vendorId === "v2" ? 0.74 : 0.96),
        },
      },
      ...(triggeredAt < now
        ? {
            pickup: {
              triggeredAt: iso(triggeredAt),
              triggeredBy: "nurse" as const,
              dueAt: iso(triggeredAt + 24 * H),
              ...(completedAt < now ? { completedAt: iso(completedAt) } : {}),
            },
          }
        : {}),
      timestamps: {
        ordered: iso(orderedAt),
        dispatched: iso(orderedAt + 0.5 * H),
        delivered: iso(deliveredAt),
        ...(triggeredAt < now ? { pickup_triggered: iso(triggeredAt) } : {}),
      },
    });
  }
  return out;
}

// ── On-hand (consignment) inventory — build-plan item 10 ─────
// Small/portable stock the hospice keeps on-site, vendor-owned. A
// curated set (like buildLiveOrders, not bulk-randomized like
// buildHistory) so each row demos a distinct point in the cycle rather
// than a wall of identical "on_hand" rows.

function buildOnHandAssets(now: number, patients: SeededPatient[]): OnHandAsset[] {
  const active = (id: string) => patients.find((p) => p.id === id)?.status === "active";
  const asset = (
    id: string,
    hcpcs: string,
    vendorId: string,
    state: OnHandState,
    daysAgo: number,
    patientId?: string,
  ): OnHandAsset => ({
    id,
    hcpcs,
    vendorId,
    state,
    ...(patientId && active(patientId) ? { patientId } : {}),
    updatedAt: iso(now - daysAgo * D),
  });

  return [
    // K0001 — standard wheelchair
    asset("OH-K0001-01", "K0001", "v1", "on_hand", 12),
    asset("OH-K0001-02", "K0001", "v1", "on_hand", 3),
    asset("OH-K0001-03", "K0001", "v2", "deployed", 6, "p6"),

    // E1130 — wheelchair, detachable arms
    asset("OH-E1130-01", "E1130", "v1", "on_hand", 20),
    asset("OH-E1130-02", "E1130", "v2", "pending_pickup", 1),

    // E0143 — folding walker
    asset("OH-E0143-01", "E0143", "v1", "on_hand", 8),
    asset("OH-E0143-02", "E0143", "v1", "on_hand", 30),
    asset("OH-E0143-03", "E0143", "v2", "deployed", 4, "p10"),
    asset("OH-E0143-04", "E0143", "v2", "maintenance", 2),

    // E0163 — commode chair
    asset("OH-E0163-01", "E0163", "v1", "on_hand", 15),
    asset("OH-E0163-02", "E0163", "v2", "on_hand", 5),
    asset("OH-E0163-03", "E0163", "v1", "in_transit_return", 0.5),
  ];
}

// ── Entry point ──────────────────────────────────────────────

export interface Seed {
  patients: Patient[];
  vendors: Vendor[];
  orders: Order[];
  onHand: OnHandAsset[];
}

/**
 * The whole world, deterministically, at time `now`.
 * Same input → byte-identical output. That's what makes
 * POST /api/reset a rehearsal tool rather than a gamble.
 */
export function buildSeed(now: number): Seed {
  const seeded = buildPatients();
  // dx now reaches the UI (Patients tab tag) — it was computed here to drive
  // DX_EQUIP's equipment weighting and previously discarded before it left
  // this function. address stays server-side only; no reason for it on a
  // person-indexed equipment-coordination view.
  const patients: Patient[] = seeded.map(({ address, ...p }) => {
    void address;
    return p;
  });
  return {
    patients,
    vendors: buildVendors(),
    orders: [...buildLiveOrders(now), ...buildHistory(now, seeded)],
    onHand: buildOnHandAssets(now, seeded),
  };
}
