"use client";

import { useState } from "react";
import type { Order, OrderState } from "@/lib/contracts";

const ETA_CHOICES = [
  { label: "Within 1 hour", hours: 1 },
  { label: "Within 2 hours", hours: 2 },
  { label: "Today, 2–4 PM", hours: 3 },
  { label: "Today, 4–6 PM", hours: 5 },
  { label: "Tomorrow morning", hours: 20 },
];

const STATE_LABEL: Record<OrderState, string> = {
  ordered: "New order",
  dispatched: "Dispatched",
  in_transit: "In transit",
  at_risk: "At risk",
  delivered: "Delivered",
  pickup_triggered: "Pickup due",
  pickup_delayed: "Pickup delayed",
};

const STATE_BADGE: Record<OrderState, string> = {
  ordered: "bg-status-ordered",
  dispatched: "bg-status-dispatched",
  in_transit: "bg-status-in-transit",
  at_risk: "bg-status-at-risk",
  delivered: "bg-status-delivered",
  pickup_triggered: "bg-status-pickup-triggered",
  pickup_delayed: "bg-status-pickup-delayed",
};

// Dispatcher's next action per state. transition() (Will's engine) becomes
// the writer once it lands — for now state advances locally so the flow demos.
const NEXT: Partial<Record<OrderState, { to: OrderState; label: string }>> = {
  dispatched: { to: "in_transit", label: "Start route" },
  in_transit: { to: "delivered", label: "Mark delivered" },
  at_risk: { to: "delivered", label: "Mark delivered" },
};

function timeLeft(iso: string): { text: string; overdue: boolean } {
  const ms = new Date(iso).getTime() - Date.now();
  const h = Math.floor(Math.abs(ms) / 3600_000);
  const m = Math.floor((Math.abs(ms) % 3600_000) / 60_000);
  const text = h > 0 ? `${h}h ${m}m` : `${m}m`;
  return ms < 0 ? { text: `${text} overdue`, overdue: true } : { text: `${text} left`, overdue: false };
}

export function VendorQueue({ initialOrders }: { initialOrders: Order[] }) {
  const [orders, setOrders] = useState(initialOrders);
  const [accepting, setAccepting] = useState<string | null>(null);

  function update(id: string, patch: Partial<Order>) {
    setOrders((os) => os.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }

  function accept(order: Order, etaHours: number) {
    update(order.id, {
      state: "dispatched",
      etaAt: new Date(Date.now() + etaHours * 3600_000).toISOString(),
      timestamps: { ...order.timestamps, dispatched: new Date().toISOString() },
    });
    setAccepting(null);
  }

  function advance(order: Order) {
    const next = NEXT[order.state];
    if (!next) return;
    update(order.id, {
      state: next.to,
      timestamps: { ...order.timestamps, [next.to]: new Date().toISOString() },
    });
  }

  const incoming = orders.filter((o) => o.state === "ordered");
  const active = orders.filter((o) => o.state !== "ordered");

  return (
    <main className="flex-1 px-3 py-4 flex flex-col gap-6">
      <Section title={`Incoming (${incoming.length})`}>
        {incoming.map((o) => (
          <OrderCard key={o.id} order={o}>
            {accepting === o.id ? (
              <div className="flex flex-col gap-1.5 pt-2">
                <div className="text-xs font-medium text-ink-soft">
                  Set delivery ETA:
                </div>
                {ETA_CHOICES.map((c) => (
                  <button
                    key={c.label}
                    onClick={() => accept(o, c.hours)}
                    className="rounded-md border border-line bg-surface px-3 py-2.5 text-left text-sm font-medium text-ink active:bg-cream"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            ) : (
              <button
                onClick={() => setAccepting(o.id)}
                className="mt-2 w-full rounded-md bg-brand px-3 py-3 text-sm font-semibold text-white active:bg-brand-alt"
              >
                Accept order
              </button>
            )}
          </OrderCard>
        ))}
        {incoming.length === 0 && <Empty text="No new orders." />}
      </Section>

      <Section title={`Active (${active.length})`}>
        {active.map((o) => (
          <OrderCard key={o.id} order={o}>
            {NEXT[o.state] && (
              <button
                onClick={() => advance(o)}
                className="mt-2 w-full rounded-md bg-secondary px-3 py-3 text-sm font-semibold text-white active:bg-secondary-hover"
              >
                {NEXT[o.state]!.label}
              </button>
            )}
          </OrderCard>
        ))}
        {active.length === 0 && <Empty text="Nothing in progress." />}
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted px-1">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong px-3 py-6 text-center text-sm text-muted">
      {text}
    </div>
  );
}

function OrderCard({ order, children }: { order: Order; children?: React.ReactNode }) {
  const deadline = timeLeft(order.targetAt);
  return (
    <div className="rounded-lg bg-surface border border-line p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span
          className={`${STATE_BADGE[order.state]} rounded-sm px-1.5 py-0.5 text-[11px] font-semibold text-white`}
        >
          {STATE_LABEL[order.state]}
        </span>
        {order.urgency === "stat" && (
          <span className="rounded-sm bg-navy px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white">
            STAT
          </span>
        )}
        <span
          className={`ml-auto text-xs font-medium tabular-nums ${
            deadline.overdue ? "text-critical" : "text-ink-soft"
          }`}
        >
          {deadline.text}
        </span>
      </div>

      <div className="mt-2 text-sm font-semibold text-ink">{order.patientLabel}</div>
      <div className="text-xs text-muted">{order.address}</div>

      <ul className="mt-2 flex flex-col gap-0.5">
        {order.items.map((it) => (
          <li key={it.hcpcs} className="text-sm text-ink-soft">
            <span className="font-mono text-[11px] text-muted mr-1.5">{it.hcpcs}</span>
            {it.name}
          </li>
        ))}
      </ul>

      {order.note && (
        <div className="mt-2 rounded-md bg-cream px-2.5 py-1.5 text-xs text-ink-soft">
          {order.note}
        </div>
      )}

      {order.etaAt && (
        <div className="mt-2 text-xs text-ink-soft">
          ETA:{" "}
          <span className="font-medium text-ink">
            {new Date(order.etaAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </span>
        </div>
      )}

      {children}
    </div>
  );
}
