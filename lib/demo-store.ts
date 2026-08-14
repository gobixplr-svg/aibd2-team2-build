"use client";

// localStorage overlay for orders created during the demo, so a new
// order survives navigation and shows up on the board AND the vendor
// queue. TEMPORARY like demo-bus: the Postgres store replaces both.

import type { Order } from "@/lib/contracts";
import { emitDemoEvent } from "@/lib/demo-bus";

const KEY = "handoff-demo-orders";

export function loadExtraOrders(): Order[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function addExtraOrder(order: Order) {
  try {
    const all = loadExtraOrders();
    all.push(order);
    localStorage.setItem(KEY, JSON.stringify(all.slice(-25)));
  } catch {
    /* best effort */
  }
  emitDemoEvent({
    meta: { eventType: "newDmeOrder", at: new Date().toISOString() },
    account: { identifiers: [{ id: "wasatch-hospice" }] },
    payload: { order },
  });
}
