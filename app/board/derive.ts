// Pure display helpers shared by the Patients and Equipment tabs. Kept
// out of the components so both tabs read the same numbers off the
// same order list — one source of truth, not two roll-ups that could
// drift apart on stage.

import type { Order, OrderState } from "@/lib/contracts";
import { dailyRateUsd } from "@/lib/data/catalog";

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

export const PILL_CLASS: Record<OrderState, string> = {
  ordered: "bg-line text-ink-soft",
  dispatched: "bg-teal/15 text-teal",
  in_transit: "bg-teal/15 text-teal",
  at_risk: "bg-warning text-ink",
  delivered: "bg-teal/15 text-teal",
  pickup_triggered: "bg-line text-ink-soft",
  pickup_delayed: "bg-critical text-white",
};

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
  const open = orders.filter((o) => o.state !== "delivered");
  if (open.length === 0) return "None";
  const top = OPEN_PRIORITY.find((s) => open.some((o) => o.state === s)) ?? open[0].state;
  const count = open.filter((o) => o.state === top).length;
  return `${count} ${OPEN_LABEL[top]}`;
}

/** Billed so far: daily rate × days on rent, from delivery to pickup (or now). */
export function orderDmeSpend(order: Order, now: number = Date.now()): number {
  const deliveredAt = order.timestamps.delivered;
  if (!deliveredAt) return 0;
  const end = order.pickup?.completedAt ? new Date(order.pickup.completedAt).getTime() : now;
  const start = new Date(deliveredAt).getTime();
  const days = Math.max((end - start) / 86_400_000, 0);
  const dailyTotal = order.items.reduce((s, it) => s + dailyRateUsd(it.hcpcs), 0);
  return Math.round(dailyTotal * days);
}

export function dmeSpendFor(orders: Order[]): number {
  return orders.reduce((s, o) => s + orderDmeSpend(o), 0);
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
}

export const INBOX_KIND_LABEL: Record<InboxKind, string> = {
  "hermes-action": "Hermes",
  "don-approval": "DON approval",
  reroute: "Reroute",
  "family-message": "Family message",
  info: "FYI",
};
