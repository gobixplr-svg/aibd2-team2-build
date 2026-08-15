// Pure display helpers shared by the Patients and Equipment tabs. Kept
// out of the components so both tabs read the same numbers off the
// same order list — one source of truth, not two roll-ups that could
// drift apart on stage.

import type { Order, OrderState, Patient, Vendor } from "@/lib/contracts";
import { categoryOf, dailyRateUsd, EQUIPMENT } from "@/lib/data/catalog";

export const STATE_LABEL: Record<OrderState, string> = {
  ordered: "Ordered",
  dispatched: "Dispatched",
  in_transit: "In transit",
  at_risk: "At risk",
  delivered: "Delivered",
  pickup_triggered: "Pickup due",
  pickup_delayed: "Pickup delayed",
};

// Rail: the colored bar carrying the triage signal (2d's stand-in for
// the old column-based board).
export const RAIL_CLASS: Record<OrderState, string> = {
  ordered: "bg-line-strong",
  dispatched: "bg-teal",
  in_transit: "bg-teal",
  at_risk: "bg-warning",
  delivered: "bg-teal",
  pickup_triggered: "bg-secondary",
  pickup_delayed: "bg-critical",
};

// Hi-fi pass (turn 3 restyle): solid brand fills, not pastel tints —
// matches the design doc's embedded badge color map exactly
// (ordered/pickup → secondary+white, dispatched/transit/delivered →
// teal+navy, at_risk unchanged since #ffaf03/#24333f was already right).
export const PILL_CLASS: Record<OrderState, string> = {
  ordered: "bg-secondary text-white",
  dispatched: "bg-teal text-navy",
  in_transit: "bg-teal text-navy",
  at_risk: "bg-warning text-ink",
  delivered: "bg-teal text-navy",
  pickup_triggered: "bg-secondary text-white",
  pickup_delayed: "bg-critical text-white",
};

/** Status pill, completion-aware: pickup completion never writes
 *  order.state (it lives on order.pickup.completedAt), so derive the
 *  label here instead of leaving "Pickup due" up after the truck left. */
export function pillFor(order: Order): { label: string; className: string } {
  if (order.pickup?.completedAt)
    return { label: "Picked up", className: PILL_CLASS.delivered };
  return { label: STATE_LABEL[order.state], className: PILL_CLASS[order.state] };
}

/** Rail color, completion-aware — same reason as pillFor: a completed
 *  pickup keeps state pickup_delayed, and a red rail on a closed order
 *  reads as an open problem. */
export function railFor(order: Order): string {
  if (order.pickup?.completedAt) return RAIL_CLASS.delivered;
  return RAIL_CLASS[order.state];
}

/** True while the order still needs a human — at-risk or pickup-delayed
 *  AND not already resolved by a completed pickup. Every "needs
 *  attention" count and badge must go through this, never raw state. */
export function orderNeedsAttention(order: Order): boolean {
  if (order.pickup?.completedAt) return false;
  return order.state === "at_risk" || order.state === "pickup_delayed";
}

/** Order's true deadline: pickup SLA once triggered, else the delivery target. */
export function effectiveDeadline(order: Order): string {
  return order.pickup?.dueAt ?? order.targetAt;
}

export function deadlineLabel(iso: string): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return d.toLocaleString([], {
    weekday: sameDay ? undefined : "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

const OPEN_PRIORITY: OrderState[] = [
  "at_risk",
  "pickup_delayed",
  "pickup_triggered",
  "in_transit",
  "dispatched",
  "ordered",
];

const OPEN_LABEL: Record<OrderState, string> = {
  ordered: "ordered",
  dispatched: "dispatched",
  in_transit: "in transit",
  at_risk: "at risk",
  delivered: "delivered",
  pickup_triggered: "pickup",
  pickup_delayed: "pickup overdue",
};

/** "1 in transit" / "1 pickup" / "None" — the Patients tab's Open DME column. */
export function openDmeLabel(orders: Order[]): string {
  // A completed pickup is closed regardless of state (which stays
  // pickup_triggered/delayed forever) — never count it as open.
  const open = orders.filter((o) => o.state !== "delivered" && !o.pickup?.completedAt);
  if (open.length === 0) return "None";
  const top = OPEN_PRIORITY.find((s) => open.some((o) => o.state === s)) ?? open[0].state;
  const count = open.filter((o) => o.state === top).length;
  return `${count} ${OPEN_LABEL[top]}`;
}

/** Days on rent so far: delivery to pickup completion (or now). */
export function daysOnRent(order: Order, now: number = Date.now()): number {
  const deliveredAt = order.timestamps.delivered;
  if (!deliveredAt) return 0;
  const end = order.pickup?.completedAt ? new Date(order.pickup.completedAt).getTime() : now;
  const start = new Date(deliveredAt).getTime();
  return Math.max((end - start) / 86_400_000, 0);
}

/** Combined daily rental rate for everything on the order. */
export function orderDailyRate(order: Order): number {
  return order.items.reduce((s, it) => s + dailyRateUsd(it.hcpcs), 0);
}

/** Billed so far: daily rate × days on rent, from delivery to pickup (or now). */
export function orderDmeSpend(order: Order, now: number = Date.now()): number {
  return Math.round(orderDailyRate(order) * daysOnRent(order, now));
}

export function dmeSpendFor(orders: Order[], now: number = Date.now()): number {
  return orders.reduce((s, o) => s + orderDmeSpend(o, now), 0);
}

/** Current monthly DME run-rate: daily rate × 30 for orders actively
 *  renting right now (delivered, not yet picked up). A monthly figure,
 *  deliberately not cumulative like dmeSpendFor — so it's comparable to
 *  Rx's monthly spend instead of double-counting against it. */
export function dmeMonthlyRunRate(orders: Order[]): number {
  return orders
    .filter((o) => o.timestamps.delivered && !o.pickup?.completedAt)
    .reduce((s, o) => s + orderDailyRate(o) * 30, 0);
}

/** Total synthetic monthly Rx spend across the given patients — the eRx
 *  side of "DME spend alongside medication spend, not in a separate
 *  silo" (bounty Required Features, hospice side). */
export function rxSpendMonthlyTotal(patients: Patient[]): number {
  return patients.reduce((s, p) => s + (p.rxSpendMonthly ?? 0), 0);
}

/** Days an order's equipment has sat idle past its pickup SLA (still accruing
 *  rent), billed in whole days — a rental doesn't stop accruing because
 *  pickup was only two hours late. Ceiling-rounded to match the money
 *  counter (api/state/route.ts), the only other place this gets computed. */
export function idlePickupDays(order: Order, now: number = Date.now()): number {
  if (!order.pickup) return 0;
  const end = order.pickup.completedAt ? new Date(order.pickup.completedAt).getTime() : now;
  const due = new Date(order.pickup.dueAt).getTime();
  if (end <= due) return 0;
  return Math.ceil((end - due) / 86_400_000);
}

// ── Analytics (Equipment › Analytics, wireframe turn 3, 3c) ──────────
// Everything below reads only order/vendor records the app already
// writes — no fabricated history. Where the source data can't honestly
// support a number (a multi-month trend, for one — the seed has no
// real historical buckets), the chart is reshaped around what the
// records actually contain rather than inventing one.

export interface EquipmentRankRow {
  hcpcs: string;
  label: string;
  count: number;
  spend: number;
}

/** Most-ordered equipment: order count + spend-to-date per catalog code. */
export function topEquipment(orders: Order[], now: number = Date.now()): EquipmentRankRow[] {
  const rows = new Map<string, EquipmentRankRow>();
  for (const o of orders) {
    for (const it of o.items) {
      const row = rows.get(it.hcpcs) ?? {
        hcpcs: it.hcpcs,
        label: EQUIPMENT[it.hcpcs]?.name ?? it.name,
        count: 0,
        spend: 0,
      };
      row.count += 1;
      row.spend += orderDmeSpend(o, now) / o.items.length;
      rows.set(it.hcpcs, row);
    }
  }
  return Array.from(rows.values()).sort((a, b) => b.count - a.count);
}

/** Spend-to-date bucketed by equipment category — the honest stand-in
 *  for a monthly trend chart when there's no multi-month history yet. */
export function spendByCategory(
  orders: Order[],
  now: number = Date.now(),
): { category: string; amount: number }[] {
  const totals = new Map<string, number>();
  for (const o of orders) {
    const perItem = orderDmeSpend(o, now) / Math.max(o.items.length, 1);
    for (const it of o.items) {
      const cat = categoryOf(it.hcpcs);
      totals.set(cat, (totals.get(cat) ?? 0) + perItem);
    }
  }
  return Array.from(totals.entries())
    .map(([category, amount]) => ({ category, amount: Math.round(amount) }))
    .sort((a, b) => b.amount - a.amount);
}

export interface LengthOfUseRow {
  hcpcs: string;
  label: string;
  avgDays: number;
  idleDays: number;
  dailyRate: number;
}

/** Avg days placed + idle (post-pickup-SLA) days per equipment code. */
export function lengthOfUseRows(orders: Order[], now: number = Date.now()): LengthOfUseRow[] {
  const byCode = new Map<string, { days: number[]; idle: number }>();
  for (const o of orders) {
    if (!o.timestamps.delivered) continue;
    for (const it of o.items) {
      const bucket = byCode.get(it.hcpcs) ?? { days: [], idle: 0 };
      bucket.days.push(daysOnRent(o, now));
      bucket.idle += idlePickupDays(o, now);
      byCode.set(it.hcpcs, bucket);
    }
  }
  return Array.from(byCode.entries())
    .map(([hcpcs, b]) => ({
      hcpcs,
      label: EQUIPMENT[hcpcs]?.name ?? hcpcs,
      avgDays: b.days.reduce((s, d) => s + d, 0) / b.days.length,
      idleDays: b.idle,
      dailyRate: dailyRateUsd(hcpcs),
    }))
    .sort((a, b) => b.avgDays - a.avgDays);
}

export interface VendorPerfRow {
  vendor: Vendor;
  spend: number;
  orderCount: number;
}

export function vendorPerformance(orders: Order[], vendors: Vendor[]): VendorPerfRow[] {
  return vendors
    .map((vendor) => {
      const vendorOrders = orders.filter((o) => o.vendorId === vendor.id);
      return {
        vendor,
        spend: dmeSpendFor(vendorOrders),
        orderCount: vendorOrders.length,
      };
    })
    .filter((r) => r.orderCount > 0)
    .sort((a, b) => (b.vendor.stats?.onTimeRate ?? 0) - (a.vendor.stats?.onTimeRate ?? 0));
}

/** Total rental days still accruing past pickup SLA, across all orders — the
 *  money the 24h clock is there to recover. `now` should be engine time
 *  (state.now from /api/state), not wall time — the demo clock can run
 *  faster than real time or jump hours, and this must agree with it. */
export function postPickupIdleDays(orders: Order[], now: number = Date.now()): number {
  return orders.reduce((s, o) => s + idlePickupDays(o, now), 0);
}

/** The money counter. This is THE pickup-overdue-cost figure — the board
 *  header, Analytics, and /api/state's `money.pickupOverdueUsd` all read
 *  off this one function so they can't drift apart on stage the way the
 *  client (wall-clock, fractional days) and server (engine time, whole
 *  days) versions of this used to. */
export function postPickupIdleCost(orders: Order[], now: number = Date.now()): number {
  return Math.round(
    orders.reduce((s, o) => s + idlePickupDays(o, now) * orderDailyRate(o), 0),
  );
}

/** Patient-days on census so far — a coarse proxy from each patient's
 *  earliest order timestamp, used only to divide total spend into a
 *  per-patient-day figure. Not a real admissions feed. */
export function patientDaysOnCensus(patient: Patient, orders: Order[], now: number = Date.now()): number {
  const patientOrders = orders.filter((o) => o.patientId === patient.id);
  const earliest = patientOrders
    .map((o) => o.timestamps.ordered)
    .filter((t): t is string => Boolean(t))
    .map((t) => new Date(t).getTime());
  if (earliest.length === 0) return 0;
  return Math.max((now - Math.min(...earliest)) / 86_400_000, 0);
}

export function ordersToCsv(orders: Order[]): string {
  const header = [
    "order_id",
    "patient",
    "items",
    "state",
    "vendor_id",
    "urgency",
    "target_at",
    "days_on_rent",
    "dme_spend_usd",
  ];
  const rows = orders.map((o) =>
    [
      o.id,
      o.patientLabel,
      o.items.map((i) => i.hcpcs).join("|"),
      o.state,
      o.vendorId,
      o.urgency,
      o.targetAt,
      daysOnRent(o).toFixed(1),
      orderDmeSpend(o),
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

// Approval inbox — lives in the Equipment tab's rail, never a separate
// console (lane card + 2d). Kept local to the hospice UI rather than
// lib/contracts.ts: Will's InboxItem there is the engine-fed shape for
// when Postgres lands; this is the demo-bus stand-in for it.
export type InboxKind = "hermes-action" | "don-approval" | "reroute" | "family-message" | "info";

export interface InboxItem {
  id: string;
  kind: InboxKind;
  title: string;
  detail: string;
  needsApproval: boolean;
  resolved?: "approved" | "dismissed";
  // Claude-drafted message body (family messages). The card renders it
  // editable; approving sends the human's edited version.
  draft?: string;
  // Lets detail views show a pending draft inline next to its patient,
  // not only in the header tray.
  patientId?: string;
  // "M. Checketts · ord-1001" — who/what this approval is about, so the
  // tray never shows an anonymous card.
  context?: string;
  // The engine's verbatim why-list, kept as an ARRAY — the tray renders
  // one row per reason instead of a semicolon-glued paragraph.
  reasons?: string[];
}

export const INBOX_KIND_LABEL: Record<InboxKind, string> = {
  "hermes-action": "Hermes",
  "don-approval": "DON approval",
  reroute: "Reroute",
  "family-message": "Family message",
  info: "FYI",
};
