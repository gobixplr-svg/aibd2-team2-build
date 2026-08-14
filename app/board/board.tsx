"use client";

import { useState } from "react";
import Link from "next/link";
import type {
  InboxItem,
  Order,
  OrderState,
  Vendor,
} from "@/lib/contracts";
import { draftStatusNote } from "@/lib/ai/draft-note";
import { postJson, useWorld } from "@/lib/use-world";

type ColumnKey = "incoming" | "active" | "delivered" | "pickup";

const COLUMNS: {
  key: ColumnKey;
  title: string;
  states: OrderState[];
  dropState?: OrderState;
}[] = [
  { key: "incoming", title: "Incoming", states: ["ordered"] },
  { key: "active", title: "Active", states: ["dispatched", "in_transit", "at_risk"], dropState: "dispatched" },
  { key: "delivered", title: "Delivered", states: ["delivered"], dropState: "delivered" },
  { key: "pickup", title: "Pickup", states: ["pickup_triggered", "pickup_delayed"], dropState: "pickup_triggered" },
];

const STATE_LABEL: Record<OrderState, string> = {
  ordered: "Ordered",
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

const LEGAL_DROPS: Record<ColumnKey, OrderState[]> = {
  incoming: [],
  active: ["ordered"],
  delivered: ["dispatched", "in_transit", "at_risk"],
  pickup: ["delivered"],
};

interface WorldState {
  orders: Order[];
  vendors: Vendor[];
  inbox: InboxItem[];
  money: { pickupOverdueUsd: number };
  cost: { totalUsd: number; calls: number; perOrderUsd: number };
}

interface PendingMove {
  order: Order;
  toState: OrderState;
  draft: string;
}

export function HospiceBoard() {
  const { state, error, refresh } = useWorld<WorldState>("?scope=hospice");
  const [dragId, setDragId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingMove | null>(null);
  const [whyId, setWhyId] = useState<string | null>(null);
  const [inboxOpen, setInboxOpen] = useState(false);

  if (error)
    return <div className="p-6 text-sm text-critical">State unavailable: {error}</div>;
  if (!state)
    return <div className="p-6 text-sm text-muted">Connecting to Hermes…</div>;

  const { orders, vendors, inbox, money } = state;
  const engineNow = new Date(state.now).getTime();
  const vendorName = (id: string) => vendors.find((v) => v.id === id)?.name ?? id;

  const pendingItems = inbox.filter((i) => i.status === "pending" && !i.silent);
  const silentCount = inbox.filter((i) => i.silent).length;

  function onDrop(col: (typeof COLUMNS)[number]) {
    const order = orders.find((o) => o.id === dragId);
    setDragId(null);
    if (!order || !col.dropState) return;
    if (!LEGAL_DROPS[col.key].includes(order.state)) return;
    setPending({ order, toState: col.dropState, draft: draftStatusNote(order, col.dropState) });
  }

  async function confirmMove(note: string) {
    if (!pending) return;
    await postJson(`/api/orders/${pending.order.id}/transition`, {
      to: pending.toState,
      note: note || undefined,
      pickupBy: pending.toState === "pickup_triggered" ? "nurse" : undefined,
    });
    setPending(null);
    refresh();
  }

  async function resolveInbox(id: string, action: "approve" | "reject") {
    await postJson(`/api/inbox/${id}`, { action });
    refresh();
  }

  function hoursLeft(iso: string): { text: string; overdue: boolean } {
    const ms = new Date(iso).getTime() - engineNow;
    const h = Math.floor(Math.abs(ms) / 3600_000);
    const m = Math.floor((Math.abs(ms) % 3600_000) / 60_000);
    const text = h > 0 ? `${h}h ${m}m` : `${m}m`;
    return ms < 0 ? { text: `${text} over`, overdue: true } : { text, overdue: false };
  }

  return (
    <main className="flex-1 p-3 lg:p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
      <div className="md:col-span-2 xl:col-span-4 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Link
            href="/board/new"
            className="rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white"
          >
            + New order
          </Link>
          {money.pickupOverdueUsd > 0 && (
            <span className="text-xs font-semibold text-critical tabular-nums">
              ${money.pickupOverdueUsd.toFixed(2)} accruing on overdue pickups
            </span>
          )}
        </div>
        <button
          onClick={() => setInboxOpen((v) => !v)}
          className={`relative rounded-md px-3 py-2 text-sm font-semibold ${
            pendingItems.length > 0
              ? "bg-warning/20 text-ink border border-warning"
              : "border border-line text-ink-soft"
          }`}
        >
          Approvals
          {pendingItems.length > 0 && (
            <span className="ml-1.5 rounded-full bg-critical px-1.5 py-0.5 text-[11px] font-bold text-white">
              {pendingItems.length}
            </span>
          )}
        </button>
      </div>

      {inboxOpen && (
        <div className="md:col-span-2 xl:col-span-4 rounded-lg border border-line bg-surface p-3 flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted">
              Approval inbox — Hermes proposes, you decide
            </div>
            {silentCount > 0 && (
              <div className="text-[11px] text-muted">
                + {silentCount} handled silently by Hermes (logged)
              </div>
            )}
          </div>
          {inbox
            .filter((i) => !i.silent)
            .map((item) => (
              <div
                key={item.id}
                className={`rounded-md border p-2.5 ${
                  item.status !== "pending"
                    ? "border-line opacity-60"
                    : "border-warning bg-warning/5"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">{item.title}</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted">
                    {item.source === "hermes"
                      ? `Hermes · ${item.tier}`
                      : item.source === "don_approval"
                        ? "DON approval"
                        : "Family message"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-soft">{item.detail}</p>
                {item.reasons.length > 0 && (
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {item.reasons.map((r) => (
                      <li key={r} className="text-[11px] text-muted">
                        • {r}
                      </li>
                    ))}
                  </ul>
                )}
                {item.draft && (
                  <div className="mt-1.5 rounded-md bg-cream px-2.5 py-1.5 text-xs italic text-ink-soft">
                    &ldquo;{item.draft}&rdquo;
                  </div>
                )}
                {item.status === "pending" ? (
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => resolveInbox(item.id, "approve")}
                      className="rounded-md bg-teal px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      {item.source === "family_message" ? "Approve & send" : "Approve"}
                    </button>
                    <button
                      onClick={() => resolveInbox(item.id, "reject")}
                      className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft"
                    >
                      Reject
                    </button>
                  </div>
                ) : (
                  <div className="mt-1.5 text-[11px] font-semibold text-muted">
                    {item.status === "approved"
                      ? `✓ Approved${item.resolvedBy ? ` by ${item.resolvedBy}` : ""}`
                      : item.status === "auto_executed"
                        ? "Auto-executed (reversible tier, logged)"
                        : "Rejected"}
                  </div>
                )}
              </div>
            ))}
          {inbox.filter((i) => !i.silent).length === 0 && (
            <div className="text-xs text-muted py-2">
              Empty — which is the point. A good night shift ends with nothing here.
            </div>
          )}
        </div>
      )}

      {COLUMNS.map((col) => {
        const cards = orders.filter((o) => col.states.includes(o.state));
        return (
          <section
            key={col.key}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(col)}
            className="rounded-lg bg-page border border-line flex flex-col gap-2 p-2 min-h-40"
          >
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted">
              {col.title} ({cards.length})
            </h2>
            {cards.map((o) => {
              const clock =
                o.state === "pickup_triggered" || o.state === "pickup_delayed"
                  ? o.pickup && hoursLeft(o.pickup.dueAt)
                  : hoursLeft(o.targetAt);
              return (
                <article
                  key={o.id}
                  draggable
                  onDragStart={() => setDragId(o.id)}
                  className={`rounded-lg bg-surface border p-3 shadow-sm cursor-grab active:cursor-grabbing ${
                    o.state === "at_risk" ? "border-warning" : "border-line"
                  }`}
                >
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`${STATE_BADGE[o.state]} rounded-sm px-1.5 py-0.5 text-[11px] font-semibold text-white`}
                    >
                      {STATE_LABEL[o.state]}
                    </span>
                    {o.urgency === "stat" && (
                      <span className="rounded-sm bg-navy px-1.5 py-0.5 text-[11px] font-bold text-white">
                        STAT
                      </span>
                    )}
                    {clock && (
                      <span
                        className={`ml-auto text-[11px] font-medium tabular-nums ${
                          clock.overdue ? "text-critical" : "text-muted"
                        }`}
                      >
                        {clock.text}
                      </span>
                    )}
                    {o.risk && (
                      <button
                        onClick={() => setWhyId(whyId === o.id ? null : o.id)}
                        className="rounded-sm bg-warning/20 px-1.5 py-0.5 text-[11px] font-semibold text-ink"
                      >
                        why? ({o.risk.score})
                      </button>
                    )}
                  </div>

                  <div className="mt-1.5 text-sm font-semibold text-ink">{o.patientLabel}</div>
                  <div className="text-xs text-muted">{vendorName(o.vendorId)}</div>

                  <ul className="mt-1">
                    {o.items.map((it) => (
                      <li key={it.hcpcs} className="text-xs text-ink-soft">
                        <span className="font-mono text-[10px] text-muted mr-1">{it.hcpcs}</span>
                        {it.name}
                      </li>
                    ))}
                  </ul>

                  {whyId === o.id && o.risk && (
                    <div className="mt-2 rounded-md border border-warning bg-warning/10 p-2">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-ink">
                        Why flagged
                      </div>
                      <ul className="mt-1 flex flex-col gap-1">
                        {o.risk.reasons.map((r) => (
                          <li key={r} className="text-xs text-ink-soft">
                            • {r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {o.note && (
                    <div className="mt-2 rounded-md bg-cream px-2 py-1 text-[11px] text-ink-soft">
                      {o.note}
                    </div>
                  )}
                </article>
              );
            })}
            {cards.length === 0 && (
              <div className="rounded-md border border-dashed border-line-strong px-2 py-5 text-center text-xs text-muted">
                Drop orders here
              </div>
            )}
          </section>
        );
      })}

      {pending && (
        <NoteModal pending={pending} onConfirm={confirmMove} onCancel={() => setPending(null)} />
      )}
    </main>
  );
}

function NoteModal({
  pending,
  onConfirm,
  onCancel,
}: {
  pending: PendingMove;
  onConfirm: (note: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState(pending.draft);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-navy/60"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md mx-auto rounded-t-xl sm:rounded-xl bg-surface p-4 pb-8 sm:pb-4 flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-base font-bold text-ink">
            Move to {STATE_LABEL[pending.toState]}
          </h2>
          <p className="text-xs text-muted">
            {pending.order.patientLabel} · {pending.order.items.map((i) => i.name).join(", ")}
          </p>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-ink-soft">
            Status note{" "}
            <span className="font-normal text-muted">(AI first draft — edit or submit as-is)</span>
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="rounded-md border border-line px-3 py-2 text-sm text-ink"
          />
        </label>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 rounded-md border border-line px-3 py-3 text-sm font-semibold text-ink-soft"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(note.trim())}
            className="flex-[2] rounded-md bg-brand px-3 py-3 text-sm font-semibold text-white active:bg-brand-alt"
          >
            Confirm move
          </button>
        </div>
      </div>
    </div>
  );
}
