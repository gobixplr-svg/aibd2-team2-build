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

import type { Order, OrderItem, Patient, Vendor } from "@/lib/contracts";

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

// ── Equipment (CMS DME PUF, national, by HCPCS) ──────────────
// monthlyUsd = avg Medicare payment per rental claim. Core hospice
// DME is nearly all rental — which is exactly why a late pickup
// costs money: "we have to pay for an additional day" (COO, brief).

export interface Equip {
  hcpcs: string;
  name: string;
  monthlyUsd: number;
  rental: boolean;
  oxygen?: boolean;
}

export const EQUIPMENT: Record<string, Equip> = {
  E1390: { hcpcs: "E1390", name: "Oxygen concentrator", monthlyUsd: 85, rental: true, oxygen: true },
  E0601: { hcpcs: "E0601", name: "CPAP device", monthlyUsd: 34, rental: true, oxygen: true },
  E0431: { hcpcs: "E0431", name: "Portable oxygen system", monthlyUsd: 17, rental: true, oxygen: true },
  E0470: { hcpcs: "E0470", name: "BiPAP respiratory assist", monthlyUsd: 91, rental: true, oxygen: true },
  K0001: { hcpcs: "K0001", name: "Standard wheelchair", monthlyUsd: 19, rental: true },
  E0260: { hcpcs: "E0260", name: "Hospital bed, semi-electric", monthlyUsd: 49, rental: true },
  E0250: { hcpcs: "E0250", name: "Hospital bed, fixed height", monthlyUsd: 47, rental: true },
  E1130: { hcpcs: "E1130", name: "Standard wheelchair (detachable arms)", monthlyUsd: 19, rental: true },
  E0277: { hcpcs: "E0277", name: "Powered pressure-reducing mattress", monthlyUsd: 162, rental: true },
  E0143: { hcpcs: "E0143", name: "Folding walker, wheeled", monthlyUsd: 49, rental: false },
  E0163: { hcpcs: "E0163", name: "Commode chair", monthlyUsd: 52, rental: false },
};

export const dailyRateUsd = (hcpcs: string) =>
  (EQUIPMENT[hcpcs]?.monthlyUsd ?? 40) / 30;

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

const NAMES = [
  "M. Checketts", "R. Okafor", "L. Sorensen", "D. Whitmer", "J. Maughan",
  "A. Petrov", "E. Tanaka", "B. Halvorsen", "C. Ruiz", "N. Abbasi",
  "G. Lindqvist", "S. Mwangi", "T. Bianchi", "H. Nakamura", "P. Oyelaran",
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
];

export interface SeededPatient extends Patient {
  dx: Dx;
  address: string;
}

export function buildPatients(): SeededPatient[] {
  const r = rng(SEED);
  return NAMES.map((label, i) => {
    const dx = weighted(r, DX_MIX);
    const id = `p${i + 1}`;
    return {
      id,
      label,
      dx,
      address: ADDRESSES[i],
      // p1 is the live discharge, p4 is the deceased pickup — both
      // have family pages in the demo click-path.
      ...(id === "p1" ? { familyToken: "demo-family" } : {}),
      ...(id === "p4" ? { familyToken: "demo-family-2" } : {}),
      status: id === "p4" ? ("deceased" as const) : ("active" as const),
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
  ];
}

// ── Historical orders ────────────────────────────────────────
// ~50 completed orders across 90 days. These are never rendered;
// they exist so vendor stats and the calibration numbers are
// computed from something real rather than typed in by hand.

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
  const COUNT = 54;

  for (let i = 0; i < COUNT; i++) {
    const daysAgo = 3 + Math.floor(r() * 87);
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
    // Older orders sit further back on the trend line, so v2's STAT
    // rate is healthy 90 days ago and poor last week.
    const onTimeP =
      urgency === "stat"
        ? p.statOnTime + p.statTrendPerDay * (90 - daysAgo)
        : p.routineOnTime;

    const onTime = r() < onTimeP;
    const deliveredAt = onTime
      ? targetAt - r() * 3 * H
      : targetAt + (0.4 + r() * 5) * H;

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
      timestamps: {
        ordered: iso(orderedAt),
        dispatched: iso(orderedAt + 0.5 * H),
        delivered: iso(deliveredAt),
      },
    });
  }
  return out;
}

// ── Entry point ──────────────────────────────────────────────

export interface Seed {
  patients: Patient[];
  vendors: Vendor[];
  orders: Order[];
}

/**
 * The whole world, deterministically, at time `now`.
 * Same input → byte-identical output. That's what makes
 * POST /api/reset a rehearsal tool rather than a gamble.
 */
export function buildSeed(now: number): Seed {
  const seeded = buildPatients();
  const patients: Patient[] = seeded.map(({ dx, address, ...p }) => {
    void dx;
    void address;
    return p;
  });
  return {
    patients,
    vendors: buildVendors(),
    orders: [...buildLiveOrders(now), ...buildHistory(now, seeded)],
  };
}
