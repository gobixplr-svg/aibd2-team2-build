// Shared mock seed used by hospice + vendor surfaces until Will's
// real seed generator lands. One source of truth — do not fork it.

import type { Order, Patient, Vendor } from "@/lib/contracts";

export const STUB_PATIENTS: Patient[] = [
  { id: "p1", label: "M. Checketts", familyToken: "demo-family", status: "active" },
  { id: "p4", label: "D. Whitmer", familyToken: "demo-family-2", status: "deceased" },
];

export function patientByFamilyToken(token: string): Patient | undefined {
  return STUB_PATIENTS.find((p) => p.familyToken === token);
}

export const STUB_VENDORS: Vendor[] = [
  {
    id: "v1",
    token: "demo-vendor",
    name: "Wasatch Medical Supply",
    connected: true,
    stats: { onTimeRate: 0.94, statOnTimeRate: 0.81, avgPickupHours: 19, podCompleteness: 0.97 },
  },
  {
    id: "v2",
    token: "demo-vendor-2",
    name: "Great Basin DME",
    connected: false,
    stats: { onTimeRate: 0.88, statOnTimeRate: 0.9, avgPickupHours: 31, podCompleteness: 0.74 },
  },
];

export const STUB_ORDERS: Order[] = [
  {
    id: "ord-1001",
    patientId: "p1",
    patientLabel: "M. Checketts",
    address: "1483 E Aspen Way, Sandy",
    items: [
      { hcpcs: "E0250", name: "Hospital bed, semi-electric" },
      { hcpcs: "E1390", name: "Oxygen concentrator" },
    ],
    urgency: "stat",
    vendorId: "v1",
    targetAt: new Date(Date.now() + 3 * 3600_000).toISOString(),
    state: "ordered",
    note: "Discharge home today 4:30 PM — bed must be in place first.",
    timestamps: { ordered: new Date().toISOString() },
  },
  {
    id: "ord-1002",
    patientId: "p2",
    patientLabel: "R. Okafor",
    address: "742 W Fort Union Blvd, Midvale",
    items: [{ hcpcs: "E0601", name: "CPAP device" }],
    urgency: "routine",
    vendorId: "v1",
    targetAt: new Date(Date.now() + 26 * 3600_000).toISOString(),
    state: "ordered",
    timestamps: { ordered: new Date().toISOString() },
  },
  {
    id: "ord-0997",
    patientId: "p3",
    patientLabel: "L. Sorensen",
    address: "88 S 900 E, Salt Lake City",
    items: [{ hcpcs: "E1130", name: "Standard wheelchair", assetId: "WMS-W-0331" }],
    urgency: "routine",
    vendorId: "v1",
    targetAt: new Date(Date.now() + 5 * 3600_000).toISOString(),
    state: "in_transit",
    etaAt: new Date(Date.now() + 0.5 * 3600_000).toISOString(),
    timestamps: {
      ordered: new Date(Date.now() - 4 * 3600_000).toISOString(),
      dispatched: new Date(Date.now() - 2 * 3600_000).toISOString(),
      in_transit: new Date(Date.now() - 1 * 3600_000).toISOString(),
    },
  },
  {
    id: "ord-1003",
    patientId: "p5",
    patientLabel: "J. Maughan",
    address: "9120 S 700 E, Sandy",
    items: [{ hcpcs: "E0431", name: "Portable oxygen system" }],
    urgency: "stat",
    vendorId: "v2",
    targetAt: new Date(Date.now() + 1.5 * 3600_000).toISOString(),
    state: "at_risk",
    etaAt: new Date(Date.now() + 2.4 * 3600_000).toISOString(),
    risk: {
      score: 82,
      reasons: [
        "Vendor ETA (5:24 PM) is 54 min past the discharge deadline (4:30 PM)",
        "Great Basin DME has not confirmed dispatch after 48 min (STAT threshold: 30 min)",
        "Vendor's STAT on-time rate this quarter: 74% and declining",
      ],
      features: {
        etaDeltaMinutes: 54,
        dispatchSilenceMinutes: 48,
        vendorStatOnTimeRate: 0.74,
        urgency: "stat",
      },
      flaggedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
    },
    timestamps: {
      ordered: new Date(Date.now() - 1 * 3600_000).toISOString(),
      dispatched: new Date(Date.now() - 0.8 * 3600_000).toISOString(),
      at_risk: new Date(Date.now() - 10 * 60_000).toISOString(),
    },
  },
  {
    id: "ord-0988",
    patientId: "p6",
    patientLabel: "A. Petrov",
    address: "455 E 3300 S, Salt Lake City",
    items: [{ hcpcs: "E0143", name: "Folding walker", assetId: "WMS-K-0912" }],
    urgency: "routine",
    vendorId: "v1",
    targetAt: new Date(Date.now() - 20 * 3600_000).toISOString(),
    state: "delivered",
    pod: {
      signedBy: "T. Petrov (daughter)",
      at: new Date(Date.now() - 21 * 3600_000).toISOString(),
      condition: { clean: true, functional: true, complete: true },
    },
    timestamps: {
      ordered: new Date(Date.now() - 44 * 3600_000).toISOString(),
      delivered: new Date(Date.now() - 21 * 3600_000).toISOString(),
    },
  },
  {
    id: "ord-0961",
    patientId: "p4",
    patientLabel: "D. Whitmer",
    address: "3310 S Redwood Rd, West Valley",
    items: [{ hcpcs: "E0250", name: "Hospital bed, semi-electric", assetId: "WMS-B-1147" }],
    urgency: "routine",
    vendorId: "v1",
    targetAt: new Date(Date.now() - 30 * 3600_000).toISOString(),
    state: "pickup_triggered",
    note: "Patient passed yesterday evening. Family present — call ahead.",
    pickup: {
      triggeredAt: new Date(Date.now() - 5 * 3600_000).toISOString(),
      triggeredBy: "nurse",
      dueAt: new Date(Date.now() + 19 * 3600_000).toISOString(),
    },
    timestamps: {
      ordered: new Date(Date.now() - 31 * 24 * 3600_000).toISOString(),
      delivered: new Date(Date.now() - 30 * 24 * 3600_000).toISOString(),
      pickup_triggered: new Date(Date.now() - 5 * 3600_000).toISOString(),
    },
  },
];

export function vendorByToken(token: string): Vendor | undefined {
  return STUB_VENDORS.find((v) => v.token === token);
}

export function vendorById(id: string): Vendor | undefined {
  return STUB_VENDORS.find((v) => v.id === id);
}
