"use client";

import { useState } from "react";
import type { Order, OrderState, Vendor } from "@/lib/contracts";
import { postJson, useWorld } from "@/lib/use-world";
import { Pulse } from "@/lib/pulse";
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

type SheetTarget = { order: Order; mode: "delivery" | "pickup" } | null;

export function VendorQueue({ token }: { token: string }) {
  const { state, error, refresh } = useWorld<{ vendor: Vendor; orders: Order[] }>(
    `?scope=vendor&token=${encodeURIComponent(token)}`,
  );
  const [accepting, setAccepting] = useState<string | null>(null);
  const [delaying, setDelaying] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetTarget>(null);

  if (error)
    return (
      <div className="min-h-dvh flex items-center justify-center p-6">
        <p className="text-sm text-critical">This dispatch link isn&apos;t active. ({error})</p>
      </div>
    );
  if (!state) return <div className="min-h-dvh bg-page" />;

  const { vendor, orders } = state;
  const engineNow = new Date(state.now).getTime();

  function timeLeft(iso: string): { text: string; overdue: boolean } {
    const ms = new Date(iso).getTime() - engineNow;
    const h = Math.floor(Math.abs(ms) / 3600_000);
    const m = Math.floor((Math.abs(ms) % 3600_000) / 60_000);
    const text = h > 0 ? `${h}h ${m}m` : `${m}m`;
    return ms < 0
      ? { text: `${text} overdue`, overdue: true }
      : { text: `${text} left`, overdue: false };
  }

  async function move(order: Order, to: OrderState, extra: Record<string, unknown> = {}) {
    await postJson(`/api/orders/${order.id}/transition`, { to, ...extra });
    refresh();
  }

  async function pickupAction(order: Order, action: string, extra: Record<string, unknown> = {}) {
    await postJson(`/api/pickup`, { orderId: order.id, action, ...extra });
    refresh();
  }

  async function confirmPod(target: NonNullable<SheetTarget>, pod: PodResult) {
    const { order, mode } = target;
    if (mode === "delivery") {
      await move(order, "delivered", {
        pod: {
          photoUrl: pod.photoUrl,
          signedBy: pod.signedBy,
          at: new Date(engineNow).toISOString(),
          condition: pod.condition,
        },
      });
    } else {
      await pickupAction(order, "complete", { condition: pod.condition });
    }
    setSheet(null);
    refresh();
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
    <div className="flex flex-col min-h-dvh w-full">
      <header className="bg-navy text-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-3 flex items-baseline justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider opacity-70">
              Handoff · Dispatch
            </div>
            <h1 className="text-lg font-semibold">{vendor.name}</h1>
          </div>
          <span className="text-[11px] opacity-70">no login needed</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 lg:px-4 lg:py-6 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 items-start">
        <Section title={`Incoming (${incoming.length})`}>
          {incoming.map((o) => (
            <OrderCard key={o.id} order={o} clock={timeLeft(o.targetAt)}>
              {accepting === o.id ? (
                <div className="flex flex-col gap-1.5 pt-2">
                  <div className="text-xs font-medium text-ink-soft">Set delivery ETA:</div>
                  {ETA_CHOICES.map((c) => (
                    <button
                      key={c.label}
                      onClick={() => {
                        move(o, "dispatched", {
                          etaAt: new Date(engineNow + c.hours * 3600_000).toISOString(),
                        });
                        setAccepting(null);
                      }}
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
            <OrderCard key={o.id} order={o} clock={timeLeft(o.targetAt)}>
              {o.state === "dispatched" && (
                <ActionBtn onClick={() => move(o, "in_transit")}>Start route</ActionBtn>
              )}
              {(o.state === "in_transit" || o.state === "at_risk") && (
                <ActionBtn onClick={() => setSheet({ order: o, mode: "delivery" })}>
                  Mark delivered
                </ActionBtn>
              )}
              {delaying === o.id ? (
                <div className="flex flex-col gap-1.5 pt-2">
                  <div className="text-xs font-medium text-ink-soft">
                    Propose a new delivery time — the care team and family see it:
                  </div>
                  {ETA_CHOICES.map((c) => (
                    <button
                      key={c.label}
                      onClick={() => {
                        // Same-state transition: state stays put, the ETA and
                        // the audit trail move. The next tick re-judges risk
                        // against the deadline honestly.
                        move(o, o.state, {
                          etaAt: new Date(engineNow + c.hours * 3600_000).toISOString(),
                        });
                        setDelaying(null);
                      }}
                      className="rounded-md border border-line bg-surface px-3 py-2.5 text-left text-sm font-medium text-ink active:bg-cream"
                    >
                      {c.label}
                    </button>
                  ))}
                  <CancelLink onClick={() => setDelaying(null)} />
                </div>
              ) : (
                <SubtleBtn onClick={() => setDelaying(o.id)}>
                  Running late? Propose a new time
                </SubtleBtn>
              )}
            </OrderCard>
          ))}
          {active.length === 0 && <Empty text="Nothing in progress." />}
        </Section>

        <Section title={`Pickups (${pickups.length})`}>
          {pickups.map((o) => {
            const p = o.pickup!;
            return (
              <OrderCard
                key={o.id}
                order={o}
                clock={timeLeft(p.dueAt)}
                clockLabel="pickup"
              >
                {/* The ladder: silence on these is what Hermes watches for. */}
                {!p.acknowledgedAt && (
                  <ActionBtn onClick={() => pickupAction(o, "acknowledge")}>
                    Acknowledge pickup
                  </ActionBtn>
                )}
                {p.acknowledgedAt && !p.windowStart && (
                  <div className="flex flex-col gap-1.5 pt-2">
                    <div className="text-xs font-medium text-ink-soft">
                      Commit a retrieval window (family sees this):
                    </div>
                    <WindowChoices
                      onPick={(startAt, endAt) =>
                        pickupAction(o, "commit_window", { startAt, endAt })
                      }
                      engineNow={engineNow}
                    />
                  </div>
                )}
                {p.acknowledgedAt && p.windowStart && (
                  <>
                    <div className="mt-2 text-xs text-ink-soft">
                      Window:{" "}
                      <span className="font-medium text-ink">
                        {new Date(p.windowStart).toLocaleString([], {
                          weekday: "short",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                        –
                        {p.windowEnd &&
                          new Date(p.windowEnd).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                      </span>
                    </div>
                    <ActionBtn onClick={() => setSheet({ order: o, mode: "pickup" })}>
                      Mark picked up
                    </ActionBtn>
                    {rescheduling === o.id ? (
                      <div className="flex flex-col gap-1.5 pt-2">
                        <div className="text-xs font-medium text-ink-soft">
                          Propose a new retrieval window (family sees this):
                        </div>
                        <WindowChoices
                          onPick={(startAt, endAt) => {
                            pickupAction(o, "commit_window", { startAt, endAt });
                            setRescheduling(null);
                          }}
                          engineNow={engineNow}
                        />
                        <CancelLink onClick={() => setRescheduling(null)} />
                      </div>
                    ) : (
                      <SubtleBtn onClick={() => setRescheduling(o.id)}>
                        Can&apos;t make the window? Reschedule
                      </SubtleBtn>
                    )}
                  </>
                )}
              </OrderCard>
            );
          })}
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
    </div>
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

// The same three windows whether committing fresh or rescheduling —
// commit_window overwrites, so a re-commit IS the reschedule.
function WindowChoices({
  onPick,
  engineNow,
}: {
  onPick: (startAt: string, endAt: string) => void;
  engineNow: number;
}) {
  return (
    <>
      {[2, 5, 20].map((h) => (
        <button
          key={h}
          onClick={() =>
            onPick(
              new Date(engineNow + h * 3600_000).toISOString(),
              new Date(engineNow + (h + 2) * 3600_000).toISOString(),
            )
          }
          className="rounded-md border border-line bg-surface px-3 py-2.5 text-left text-sm font-medium text-ink active:bg-cream"
        >
          {h === 2 ? "Today, next 2–4 hours" : h === 5 ? "Today, later window" : "Tomorrow morning"}
        </button>
      ))}
    </>
  );
}

function SubtleBtn({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="mt-1.5 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium text-ink-soft active:bg-cream"
    >
      {children}
    </button>
  );
}

function CancelLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="self-start px-1 py-1 text-xs text-muted underline"
    >
      Never mind
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
  clock,
  clockLabel,
  done,
}: {
  order: Order;
  children?: React.ReactNode;
  clock?: { text: string; overdue: boolean };
  clockLabel?: string;
  done?: boolean;
}) {
  const pickedUp = !!order.pickup?.completedAt;
  return (
    <Pulse
      watch={`${order.state}:${order.etaAt ?? ""}:${order.pickup?.acknowledgedAt ?? ""}:${order.pickup?.windowStart ?? ""}:${order.note ?? ""}`}
      className={`rounded-lg bg-surface border border-line p-3 shadow-sm ${done ? "opacity-80" : ""}`}
    >
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
        {!done && clock && (
          <span
            className={`ml-auto text-xs font-medium tabular-nums ${
              clock.overdue ? "text-critical" : "text-ink-soft"
            }`}
          >
            {clockLabel ? `${clockLabel}: ${clock.text}` : clock.text}
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
            {it.assetId && (
              <span className="ml-1.5 text-[10px] text-muted">#{it.assetId}</span>
            )}
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
    </Pulse>
  );
}
