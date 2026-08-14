// TEMPORARY mock data for the vendor lane — DELETE when Will's seed
// generator lands. Types come from the real contract (lib/contracts.ts).

import type { Order, Vendor } from "@/lib/contracts";

export const STUB_VENDORS: Vendor[] = [
  {
    id: "v1",
    token: "demo-vendor",
    name: "Wasatch Medical Supply",
    connected: true,
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
    items: [{ hcpcs: "E1130", name: "Standard wheelchair" }],
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
];

STUB_ORDERS.push({
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
});

export function vendorByToken(token: string): Vendor | undefined {
  return STUB_VENDORS.find((v) => v.token === token);
}
