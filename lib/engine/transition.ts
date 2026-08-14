// ─────────────────────────────────────────────────────────────
// The state machine. Owned by Will (engine lane).
//
// transition() is the ONLY writer of order.state. Every path — the
// vendor tapping "dispatched", the nurse triggering pickup, an eRx
// event landing from the EMR, the engine flagging at-risk — goes
// through here, and every one of them timestamps.
//
// That single-writer rule is what makes the audit trail real rather
// than decorative: if a state changed, there is a timestamp and an
// event explaining it, with no exceptions to reason about.
// ─────────────────────────────────────────────────────────────

import type { HandoffEvent, Order, OrderState } from "@/lib/contracts";
import { TRANSITIONS } from "@/lib/contracts";
import { appendEvent, getOrder, putOrder } from "@/lib/data/db";

export class IllegalTransition extends Error {
  constructor(
    readonly from: OrderState,
    readonly to: OrderState,
    readonly orderId: string,
  ) {
    super(`${orderId}: ${from} → ${to} is not a legal transition`);
    this.name = "IllegalTransition";
  }
}

export function canTransition(from: OrderState, to: OrderState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export interface TransitionPatch {
  etaAt?: string;
  pod?: Order["pod"];
  pickup?: Order["pickup"];
  risk?: Order["risk"];
  note?: string;
  vendorId?: string;
}

/**
 * Move an order to a new state, at engine time `now`.
 *
 * Pure — takes the order, returns a new order. The caller persists.
 * Time is a parameter here for the same reason it is in tick(): the
 * demo clock has to be able to drive it.
 */
export function transition(
  order: Order,
  to: OrderState,
  now: number,
  patch: TransitionPatch = {},
): Order {
  if (order.state !== to && !canTransition(order.state, to)) {
    throw new IllegalTransition(order.state, to, order.id);
  }
  return {
    ...order,
    ...patch,
    state: to,
    timestamps: { ...order.timestamps, [to]: new Date(now).toISOString() },
  };
}

/** Load → transition → persist → append the event. The server-side path. */
export async function applyTransition(
  orderId: string,
  to: OrderState,
  now: number,
  patch: TransitionPatch = {},
  eventType = "dmeStatusUpdate",
): Promise<Order> {
  const order = await getOrder(orderId);
  if (!order) throw new Error(`unknown order ${orderId}`);

  const next = transition(order, to, now, patch);
  await putOrder(next);
  await appendEvent(statusEvent(next, order.state, now, eventType));
  return next;
}

// ── eRx-shaped events ────────────────────────────────────────
// Mirrors the payload pattern BetterRX shared in the FAQ
// (meta.eventType + account.identifiers + payload). An EMR
// integration is then one more producer into the same log —
// which is literally their question: "without a rebuild?"

export function statusEvent(
  order: Order,
  from: OrderState,
  now: number,
  eventType = "dmeStatusUpdate",
): HandoffEvent {
  return {
    meta: { eventType, at: new Date(now).toISOString() },
    account: { identifiers: [{ id: order.patientId }] },
    payload: {
      orderId: order.id,
      from,
      to: order.state,
      vendorId: order.vendorId,
      urgency: order.urgency,
    },
  };
}

export function patientStatusEvent(
  patientId: string,
  status: "admitted" | "discharged" | "deceased",
  now: number,
  source: "nurse" | "emr",
): HandoffEvent {
  return {
    // The FAQ's own event name for patient create/update.
    meta: { eventType: "newOrUpdatePatient", at: new Date(now).toISOString() },
    account: { identifiers: [{ id: patientId }] },
    payload: { status, source },
  };
}

// ── Pickup trigger ───────────────────────────────────────────
// Nurse-initiated is PRIMARY; the EMR event is the redundant
// fallback. That ordering is the sponsor's correction, not our
// design choice — they've watched the EMR-only path fail, where
// a death never reached the vendor.

export function pickupPatch(now: number, by: "nurse" | "emr", slaHours: number) {
  return {
    pickup: {
      triggeredAt: new Date(now).toISOString(),
      triggeredBy: by,
      dueAt: new Date(now + slaHours * 3_600_000).toISOString(),
    },
  };
}
