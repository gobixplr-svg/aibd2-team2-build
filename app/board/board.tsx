"use client";

import { useState } from "react";
import type { Order, OrderState, Vendor } from "@/lib/contracts";
import { draftStatusNote } from "@/lib/ai/draft-note";

type ColumnKey = "incoming" | "active" | "delivered" | "pickup";

const COLUMNS: {
  key: ColumnKey;
  title: string;
  states: OrderState[];
  dropState?: OrderState; // state applied when a card is dropped here
}[] = [
  { key: "incoming", title: "Incoming", states: ["ordered"], dropState: undefined },
  {
    key: "active",
    title: "Active",
    states: ["dispatched", "in_transit", "at_risk"],
    dropState: "dispatched",
  },
  { key: "delivered", title: "Delivered", states: ["delivered"], dropState: "delivered" },
  {
    key: "pickup",
    title: "Pickup",
    states: ["pickup_triggered", "pickup_delayed"],
    dropState: "pickup_triggered",
  },
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

// Which drops are legal, hospice-side (mirrors TRANSITIONS at column granularity).
const LEGAL_DROPS: Record<ColumnKey, OrderState[]> = {
  incoming: [],
  active: ["ordered"],
  delivered: ["dispatched", "in_transit", "at_risk"],
  pickup: ["delivered"],
};

interface PendingMove {
  order: Order;
  toColumn: ColumnKey;
  toState: OrderState;
  draft: string;
}

export function HospiceBoard({
  initialOrders,
  vendors,
}: {
  initialOrders: Order[];
  vendors: Vendor[];
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [dragId, setDragId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingMove | null>(null);
  const [whyId, setWhyId] = useState<string | null>(null);

  const vendorName = (id: string) => vendors.find((v) => v.id === id)?.name ?? id;

  function onDrop(col: (typeof COLUMNS)[number]) {
    const order = orders.find((o) => o.id === dragId);
    setDragId(null);
    if (!order || !col.dropState) return;
    if (!LEGAL_DROPS[col.key].includes(order.state)) return;
    setPending({
      order,
      toColumn: col.key,
      toState: col.dropState,
      draft: draftStatusNote(order, col.dropState),
    });
  }

  function confirmMove(note: string) {
    if (!pending) return;
    const now = new Date().toISOString();
    setOrders((os) =>
      os.map((o) =>
        o.id === pending.order.id
          ? {
              ...o,
              state: pending.toState,
              note: note || o.note,
              timestamps: { ...o.timestamps, [pending.toState]: now },
              pickup:
                pending.toState === "pickup_triggered"
                  ? {
                      triggeredAt: now,
                      triggeredBy: "nurse" as const,
                      dueAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
                    }
                  : o.pickup,
            }
          : o,
      ),
    );
    setPending(null);
  }

  return (
    <main className="flex-1 p-3 lg:p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
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
            {cards.map((o) => (
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
                  {o.risk && (
                    <button
                      onClick={() => setWhyId(whyId === o.id ? null : o.id)}
                      className="ml-auto rounded-sm bg-warning/20 px-1.5 py-0.5 text-[11px] font-semibold text-ink"
                    >
                      why? ({o.risk.score})
                    </button>
                  )}
                </div>

                <div className="mt-1.5 text-sm font-semibold text-ink">
                  {o.patientLabel}
                </div>
                <div className="text-xs text-muted">{vendorName(o.vendorId)}</div>

                <ul className="mt-1">
                  {o.items.map((it) => (
                    <li key={it.hcpcs} className="text-xs text-ink-soft">
                      <span className="font-mono text-[10px] text-muted mr-1">
                        {it.hcpcs}
                      </span>
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
            ))}
            {cards.length === 0 && (
              <div className="rounded-md border border-dashed border-line-strong px-2 py-5 text-center text-xs text-muted">
                Drop orders here
              </div>
            )}
          </section>
        );
      })}

      {pending && (
        <NoteModal
          pending={pending}
          onConfirm={confirmMove}
          onCancel={() => setPending(null)}
        />
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
            {pending.order.patientLabel} ·{" "}
            {pending.order.items.map((i) => i.name).join(", ")}
          </p>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-ink-soft">
            Status note{" "}
            <span className="font-normal text-muted">
              (AI first draft — edit or submit as-is)
            </span>
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
