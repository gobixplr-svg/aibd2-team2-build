"use client";

import { useState } from "react";
import type { Order } from "@/lib/contracts";
import { categoryOf } from "@/lib/data/catalog";
import {
  INBOX_KIND_LABEL,
  PILL_CLASS,
  RAIL_CLASS,
  STATE_LABEL,
  deadlineLabel,
  dmeSpendFor,
  effectiveDeadline,
  type InboxItem,
} from "./derive";

// Turn 2, 2d/2e: one deadline-sorted list, no drag columns — sort order
// and the colored rail do the triage. Approvals, spend, and inventory
// live in the rail beside it, never a separate console.
export function EquipmentTab({
  orders,
  vendorName,
  inbox,
  onApprove,
  onDismiss,
  onAddNote,
  onMessageFamily,
  onRequestReroute,
}: {
  orders: Order[];
  vendorName: (id: string) => string;
  inbox: InboxItem[];
  onApprove: (id: string) => void;
  onDismiss: (id: string) => void;
  onAddNote: (orderId: string, note: string) => void;
  onMessageFamily: (patientId: string) => void;
  onRequestReroute: (orderId: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("All");

  const categories = Array.from(
    new Set(orders.flatMap((o) => o.items.map((it) => categoryOf(it.hcpcs)))),
  );

  const q = query.trim().toLowerCase();
  const sorted = [...orders]
    .filter((o) => category === "All" || o.items.some((it) => categoryOf(it.hcpcs) === category))
    .filter(
      (o) =>
        !q ||
        o.patientLabel.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q) ||
        o.items.some((it) => it.assetId?.toLowerCase().includes(q)),
    )
    .sort(
      (a, b) => new Date(effectiveDeadline(a)).getTime() - new Date(effectiveDeadline(b)).getTime(),
    );

  const needsAttention = orders.filter(
    (o) => o.state === "at_risk" || o.state === "pickup_delayed",
  ).length;

  const openApprovals = inbox.filter((i) => !i.resolved);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px]">
      <div className="border-b lg:border-b-0 lg:border-r border-line p-5">
        <div className="mb-3.5 flex flex-wrap items-center gap-1.5 text-[10px]">
          <Chip active={category === "All"} onClick={() => setCategory("All")}>
            All {orders.length}
          </Chip>
          {categories.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
              {c} {orders.filter((o) => o.items.some((it) => categoryOf(it.hcpcs) === c)).length}
            </Chip>
          ))}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search patient / asset ID"
            className="ml-auto rounded-full border border-dashed border-line-strong bg-page px-3 py-1.5 text-[11px] text-ink placeholder:text-muted"
          />
          {needsAttention > 0 && (
            <span className="w-full text-right text-[10px] text-critical lg:w-auto lg:ml-2">
              {needsAttention} need attention
            </span>
          )}
        </div>

        <div className="grid grid-cols-[14px_1.05fr_.7fr_.95fr_.85fr_.85fr_18px] gap-2.5 border-b border-line pb-2 text-[9px] uppercase tracking-wide text-muted">
          <div />
          <div>Patient</div>
          <div>Code</div>
          <div>Status</div>
          <div>Vendor</div>
          <div>Deadline</div>
          <div />
        </div>

        {sorted.map((o) => {
          const isOpen = expanded === o.id;
          return (
            <div key={o.id}>
              <button
                onClick={() => setExpanded(isOpen ? null : o.id)}
                className="grid w-full grid-cols-[14px_1.05fr_.7fr_.95fr_.85fr_.85fr_18px] items-center gap-2.5 border-b border-line py-3 text-left text-[11px] text-ink"
              >
                <span className={`h-8 w-[5px] rounded-sm ${RAIL_CLASS[o.state]}`} />
                <span>
                  <span className="block font-medium">{o.patientLabel}</span>
                  <span className="block font-mono text-[9px] text-muted">
                    {o.items[0]?.assetId ?? o.id}
                  </span>
                </span>
                <span className="font-mono text-[10px]">
                  {o.items[0]?.hcpcs}
                  {o.items.length > 1 ? ` +${o.items.length - 1}` : ""}
                </span>
                <span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${PILL_CLASS[o.state]}`}
                  >
                    {STATE_LABEL[o.state]}
                  </span>
                </span>
                <span className="text-[10px] text-ink-soft">{vendorName(o.vendorId)}</span>
                <span className="text-[10px]">{deadlineLabel(effectiveDeadline(o))}</span>
                <span className="text-right text-muted">{isOpen ? "⌄" : "›"}</span>
              </button>

              {isOpen && (
                <div className="mb-2.5 rounded-xl border border-line bg-page p-4 shadow-sm">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      {o.risk ? (
                        <>
                          <div className="mb-2 text-[9px] uppercase tracking-wide text-muted">
                            Why it&apos;s flagged · score {o.risk.score} · verbatim
                          </div>
                          <div className="flex flex-col gap-1.5">
                            {o.risk.reasons.map((r) => (
                              <div
                                key={r}
                                className="flex gap-2 rounded-md border border-line bg-surface px-2.5 py-2 text-[10.5px] leading-relaxed text-ink"
                              >
                                <span className="font-bold text-warning">·</span>
                                <span>{r}</span>
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 mb-1.5 text-[9px] uppercase tracking-wide text-muted">
                            Features · the audit trail
                          </div>
                          <div className="flex flex-col gap-1">
                            {Object.entries(o.risk.features).map(([k, v]) => (
                              <div
                                key={k}
                                className="flex justify-between gap-2 rounded-md bg-surface px-2.5 py-1.5 text-[10px]"
                              >
                                <span className="font-mono text-ink-soft">{k}</span>
                                <span className="font-medium text-ink">{String(v)}</span>
                              </div>
                            ))}
                          </div>
                          <div className="mt-2 text-[10px] text-muted">
                            Stored fields only. No free text, no generated reasoning.
                          </div>
                        </>
                      ) : (
                        <div className="text-[11px] text-muted">Not flagged.</div>
                      )}
                    </div>
                    <div>
                      <div className="mb-2 text-[9px] uppercase tracking-wide text-muted">Order</div>
                      <div className="rounded-md border border-line bg-surface p-3 text-[11px] leading-loose text-ink">
                        <Row label="Item" value={o.items.map((i) => i.name).join(", ")} />
                        <Row label="Vendor" value={vendorName(o.vendorId)} />
                        <Row label="ETA" value={o.etaAt ? deadlineLabel(o.etaAt) : "—"} />
                        <Row label="Deadline" value={deadlineLabel(o.targetAt)} />
                        <Row label="Urgency" value={o.urgency === "stat" ? "STAT" : "Routine"} />
                      </div>
                      <div className="mt-3 flex flex-wrap justify-end gap-1.5">
                        <button
                          onClick={() => {
                            const note = window.prompt("Note", o.note ?? "");
                            if (note !== null) onAddNote(o.id, note);
                          }}
                          className="rounded-md border border-line-strong bg-surface px-3 py-2 text-[11px] text-ink-soft"
                        >
                          Add note
                        </button>
                        <button
                          onClick={() => onMessageFamily(o.patientId)}
                          className="rounded-md border border-line-strong bg-surface px-3 py-2 text-[11px] text-ink-soft"
                        >
                          Message family
                        </button>
                        {(o.state === "at_risk" || o.state === "pickup_delayed") && (
                          <button
                            onClick={() => onRequestReroute(o.id)}
                            className="rounded-md bg-brand px-3.5 py-2 text-[11px] font-semibold text-white"
                          >
                            Request reroute
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {sorted.length === 0 && (
          <div className="mt-4 rounded-md border border-dashed border-line-strong py-8 text-center text-xs text-muted">
            No orders match.
          </div>
        )}
      </div>

      <div className="bg-page p-4 flex flex-col gap-3">
        <div className="rounded-xl border border-line bg-surface p-3.5">
          <div className="mb-2.5 text-[10px] uppercase tracking-wide text-muted">
            Approvals · {openApprovals.length}
          </div>
          {openApprovals.length === 0 ? (
            <div className="text-[11px] text-muted">Nothing waiting.</div>
          ) : (
            openApprovals.map((a) => (
              <div key={a.id} className="border-b border-line py-2 last:border-b-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-[9px] uppercase tracking-wide text-muted">
                    {INBOX_KIND_LABEL[a.kind]}
                  </span>
                </div>
                <div className="my-1.5 text-[11px] leading-relaxed text-ink">{a.detail}</div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => onApprove(a.id)}
                    className="rounded-md bg-brand px-3 py-1.5 text-[10px] font-semibold text-white"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => onDismiss(a.id)}
                    className="rounded-md border border-line-strong px-2.5 py-1.5 text-[10px] text-ink-soft"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex gap-2.5">
          <div className="flex-1 rounded-xl border border-line bg-surface p-3">
            <div className="mb-1 text-[9px] uppercase tracking-wide text-muted">DME spend</div>
            <div className="text-lg font-semibold text-ink">
              ${dmeSpendFor(orders).toLocaleString()}
            </div>
          </div>
          <div className="flex-1 rounded-xl border border-line bg-surface p-3">
            <div className="mb-1 text-[9px] uppercase tracking-wide text-muted">On hand</div>
            <div className="text-lg font-semibold text-ink">17</div>
            <div className="mt-0.5 text-[9px] text-muted">6 beds · 2 O₂ · 9 other</div>
          </div>
        </div>

        <div className="rounded-xl border border-dashed border-line-strong bg-page p-3.5">
          <span className="mb-2 inline-block rounded-full border border-line-strong px-2 py-0.5 text-[9px] uppercase tracking-wide text-ink-soft">
            Pending
          </span>
          <div className="text-[11px] leading-relaxed text-ink">
            Carrying 6 beds against 1.8/week usage — 2 would cover it.
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 ${
        active ? "bg-navy text-white" : "border border-line text-ink-soft"
      }`}
    >
      {children}
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex">
      <span className="min-w-[90px] text-ink-soft">{label}</span>
      <span>{value}</span>
    </div>
  );
}
