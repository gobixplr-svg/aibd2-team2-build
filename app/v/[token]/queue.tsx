"use client";

import { useState } from "react";
import type { Order, OrderState } from "@/lib/contracts";
import { PodSheet, type PodResult } from "./pod-sheet";

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

function timeLeft(iso: string): { text: string; overdue: boolean } {
  const ms = new Date(iso).getTime() - Date.now();
  const h = Math.floor(Math.abs(ms) / 3600_000);
  const m = Math.floor((Math.abs(ms) % 3600_000) / 60_000);
  const text = h > 0 ? `${h}h ${m}m` : `${m}m`;
  return ms < 0
    ? { text: `${text} overdue`, overdue: true }
    : { text: `${text} left`, overdue: false };
}

type SheetTarget = { order: Order; mode: "delivery" | "pickup" } | null;

export function VendorQueue({ initialOrders }: { initialOrders: Order[] }) {
  const [orders, setOrders] = useState(initialOrders);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetTarget>(null);

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

  function startRoute(order: Order) {
    update(order.id, {
      state: "in_transit",
      timestamps: { ...order.timestamps, in_transit: new Date().toISOString() },
    });
  }

  function confirmPod(target: NonNullable<SheetTarget>, pod: PodResult) {
    const { order, mode } = target;
    const now = new Date().toISOString();
    if (mode === "delivery") {
      update(order.id, {
        state: "delivered",
        pod: { photoUrl: pod.photoUrl, signedBy: pod.signedBy, at: now, condition: pod.condition },
        timestamps: { ...order.timestamps, delivered: now },
      });
    } else {
      update(order.id, {
        pickup: order.pickup
          ? { ...order.pickup, completedAt: now, condition: pod.condition }
          : undefined,
      });
    }
    setSheet(null);
  }

  const incoming = orders.filter((o) => o.state === "ordered");
  const active = orders.filter((o) =>
    ["dispatched", "in_transit", "at_risk"].includes(o.state),
  );
  const pickups = orders.filter(
    (o) =>
      ["pickup_triggered", "pickup_delayed"].includes(o.state) && !o.pickup?.completedAt,
  );
  const done = orders.filter(
    (o) => (o.state === "delivered" && o.pod) || o.pickup?.completedAt,
  );

  return (
    <main className="flex-1 px-3 py-4 lg:px-4 lg:py-6 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 items-start">
      <Section title={`Incoming (${incoming.length})`}>
        {incoming.map((o) => (
          <OrderCard key={o.id} order={o}>
            {accepting === o.id ? (
              <div className="flex flex-col gap-1.5 pt-2">
                <div className="text-xs font-medium text-ink-soft">Set delivery ETA:</div>
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
            {o.state === "dispatched" && (
              <ActionBtn onClick={() => startRoute(o)}>Start route</ActionBtn>
            )}
            {(o.state === "in_transit" || o.state === "at_risk") && (
              <ActionBtn onClick={() => setSheet({ order: o, mode: "delivery" })}>
                Mark delivered
              </ActionBtn>
            )}
          </OrderCard>
        ))}
        {active.length === 0 && <Empty text="Nothing in progress." />}
      </Section>

      <Section title={`Pickups (${pickups.length})`}>
        {pickups.map((o) => (
          <OrderCard key={o.id} order={o} clockIso={o.pickup?.dueAt}>
            <ActionBtn onClick={() => setSheet({ order: o, mode: "pickup" })}>
              Mark picked up
            </ActionBtn>
          </OrderCard>
        ))}
        {pickups.length === 0 && <Empty text="No pickups due." />}
      </Section>

      {done.length > 0 && (
        <div className="md:col-span-2 xl:col-span-3">
          <Section title={`Done today (${done.length})`}>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {done.map((o) => (
                <OrderCard key={o.id} order={o} done />
              ))}
            </div>
          </Section>
        </div>
      )}

      {sheet && (
        <PodSheet
          order={sheet.order}
          mode={sheet.mode}
          onConfirm={(pod) => confirmPod(sheet, pod)}
          onCancel={() => setSheet(null)}
        />
      )}
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

function ActionBtn({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="mt-2 w-full rounded-md bg-secondary px-3 py-3 text-sm font-semibold text-white active:bg-secondary-hover"
    >
      {children}
    </button>
  );
}

function ConditionChip({ order }: { order: Order }) {
  const cond = order.pickup?.condition ?? order.pod?.condition;
  if (!cond) return null;
  const ok = cond.clean && cond.functional && cond.complete;
  return ok ? (
    <span className="rounded-sm bg-teal/15 px-1.5 py-0.5 text-[11px] font-semibold text-teal">
      Condition ✓
    </span>
  ) : (
    <span className="rounded-sm bg-warning/20 px-1.5 py-0.5 text-[11px] font-semibold text-ink">
      Condition issue: {cond.note}
    </span>
  );
}

function OrderCard({
  order,
  children,
  clockIso,
  done,
}: {
  order: Order;
  children?: React.ReactNode;
  clockIso?: string;
  done?: boolean;
}) {
  const clock = timeLeft(clockIso ?? order.targetAt);
  const pickedUp = !!order.pickup?.completedAt;
  return (
    <div className={`rounded-lg bg-surface border border-line p-3 shadow-sm ${done ? "opacity-80" : ""}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`${STATE_BADGE[order.state]} rounded-sm px-1.5 py-0.5 text-[11px] font-semibold text-white`}
        >
          {pickedUp ? "Picked up" : STATE_LABEL[order.state]}
        </span>
        {order.urgency === "stat" && !done && (
          <span className="rounded-sm bg-navy px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white">
            STAT
          </span>
        )}
        {done && <ConditionChip order={order} />}
        {!done && (
          <span
            className={`ml-auto text-xs font-medium tabular-nums ${
              clock.overdue ? "text-critical" : "text-ink-soft"
            }`}
          >
            {clockIso ? `pickup: ${clock.text}` : clock.text}
          </span>
        )}
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

      {order.note && !done && (
        <div className="mt-2 rounded-md bg-cream px-2.5 py-1.5 text-xs text-ink-soft">
          {order.note}
        </div>
      )}

      {order.etaAt && !done && order.state !== "delivered" && (
        <div className="mt-2 text-xs text-ink-soft">
          ETA:{" "}
          <span className="font-medium text-ink">
            {new Date(order.etaAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        </div>
      )}

      {children}
    </div>
  );
}
