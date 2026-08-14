"use client";

import { useState } from "react";
import type { Order, Patient } from "@/lib/contracts";

// Compose modal for "Message family" (patients + equipment tabs). Claude
// drafts a first pass; a person edits and sends — the human_facing tier
// (lib/contracts.ts) never lets Hermes send one alone.

const PRIORITY: Order["state"][] = [
  "at_risk",
  "pickup_delayed",
  "pickup_triggered",
  "in_transit",
  "dispatched",
  "ordered",
  "delivered",
];

function draftMessage(patient: Patient, orders: Order[]): string {
  const order = PRIORITY.map((s) => orders.find((o) => o.state === s)).find(Boolean);
  const items = order?.items.map((i) => i.name.toLowerCase()).join(" and ");

  if (!order) {
    return `Hi, this is Wasatch Hospice checking in on ${patient.label}. Please let us know if you need anything.`;
  }

  switch (order.state) {
    case "at_risk":
    case "pickup_delayed":
      return `Hi, this is Wasatch Hospice. We're keeping a close eye on the ${items} — it's taking a little longer than expected, and we're on it. We'll update you as soon as we know more. You don't need to do anything.`;
    case "pickup_triggered":
      return `Hi, this is Wasatch Hospice. Pickup of the ${items} is scheduled${order.pickup ? ` by ${new Date(order.pickup.dueAt).toLocaleString([], { weekday: "long", hour: "numeric", minute: "2-digit" })}` : ""}. No one needs to be home — we're so sorry for your loss.`;
    case "in_transit":
    case "dispatched":
    case "ordered":
      return `Hi, this is Wasatch Hospice. Your ${items} is on its way${order.etaAt ? `, expected around ${new Date(order.etaAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}. Please let us know if you have any questions.`;
    case "delivered":
      return `Hi, this is Wasatch Hospice. Just checking in — your ${items} was delivered${order.pod?.signedBy ? ` and received by ${order.pod.signedBy}` : ""}. Let us know if everything is set up and working well.`;
  }
}

export function MessageFamilyModal({
  patient,
  orders,
  onSend,
  onCancel,
}: {
  patient: Patient;
  orders: Order[];
  onSend: (body: string) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState(() => draftMessage(patient, orders));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/45 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 text-sm font-semibold text-ink">
          Message {patient.label}&apos;s family
        </div>
        <p className="mb-3.5 text-xs text-muted">
          Claude drafts, you send — edit as needed before it goes out.
        </p>

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          className="w-full rounded-md border border-line bg-page px-3 py-2.5 text-sm leading-relaxed text-ink"
        />

        <div className="mt-3.5 flex gap-2">
          <button
            onClick={() => onSend(body.trim())}
            disabled={!body.trim()}
            className="flex-1 rounded-md bg-brand px-3 py-2.5 text-center text-xs font-semibold text-white disabled:opacity-40"
          >
            Send
          </button>
          <button
            onClick={onCancel}
            className="rounded-md border border-line-strong bg-surface px-4 py-2.5 text-xs text-ink-soft"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
