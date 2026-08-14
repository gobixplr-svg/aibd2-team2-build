import type { Order, OrderState } from "@/lib/contracts";

// AI first-pass note on status change. TEMPLATE STUB for now —
// TODO(dan): swap body for a Claude call (Sonnet, ~150 tokens) once the
// team API key is in .env.local. Keep the signature; the board already
// treats output as a draft the human edits before submit.
export function draftStatusNote(order: Order, to: OrderState): string {
  const items = order.items.map((i) => i.name.toLowerCase()).join(", ");
  switch (to) {
    case "dispatched":
      return `Order accepted by vendor for ${order.patientLabel} (${items}). ETA pending route assignment; deadline ${new Date(order.targetAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`;
    case "delivered":
      return `${items} delivered to ${order.patientLabel} at ${order.address}. POD and condition checklist on file from the vendor.`;
    case "pickup_triggered":
      return `Pickup requested for ${items} at ${order.patientLabel}'s residence. Family has been notified; retrieval due within 24 hours.`;
    default:
      return `Status updated to ${to.replace(/_/g, " ")} for ${order.patientLabel} (${items}).`;
  }
}
