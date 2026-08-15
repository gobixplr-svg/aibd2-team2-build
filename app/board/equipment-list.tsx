"use client";

import { useState } from "react";
import type { Order } from "@/lib/contracts";
import { Pulse } from "@/lib/pulse";
import { categoryOf } from "@/lib/data/catalog";
import {
  PILL_CLASS,
  RAIL_CLASS,
  STATE_LABEL,
  deadlineLabel,
  effectiveDeadline,
} from "./derive";

// Wireframe turn 3, 3a: the flat deadline-sorted list (turn 2's 2d/2e),
// minus the rail — approvals moved to the header tray, spend/on-hand
// moved into Analytics. This sub-tab is just the list.
export function EquipmentList({
  orders,
  vendorName,
  onNewOrder,
  onAddNote,
  onMessageFamily,
  onRequestReroute,
}: {
  orders: Order[];
  vendorName: (id: string) => string;
  onNewOrder: () => void;
  onAddNote: (orderId: string) => void;
  onMessageFamily: (patientId: string) => Promise<boolean>;
  onRequestReroute: (orderId: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [familyStatus, setFamilyStatus] = useState<Record<string, "sending" | "sent" | "error">>(
    {},
  );

  async function handleMessageFamily(orderId: string, patientId: string) {
    setFamilyStatus((s) => ({ ...s, [orderId]: "sending" }));
    const ok = await onMessageFamily(patientId);
    setFamilyStatus((s) => ({ ...s, [orderId]: ok ? "sent" : "error" }));
    setTimeout(() => {
      setFamilyStatus((s) => {
        const { [orderId]: _drop, ...rest } = s;
        return rest;
      });
    }, 3000);
  }

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

  return (
    <div className="p-5">
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
        <button
          onClick={onNewOrder}
          className="rounded-md bg-brand px-3.5 py-1.5 text-[11px] font-semibold text-white"
        >
          New order
        </button>
        {needsAttention > 0 && (
          <span className="w-full text-right text-[10px] text-critical">
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
          <Pulse key={o.id} watch={`${o.state}:${o.risk?.score ?? ""}:${o.etaAt ?? ""}`}>
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
                    <div className="mt-2.5 rounded-md border border-dashed border-line-strong bg-surface p-3">
                      <div className="mb-1 text-[9px] uppercase tracking-wide text-muted">Note</div>
                      <div className="text-[11px] leading-relaxed text-ink-soft">
                        {o.note || "No notes yet."}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap justify-end gap-1.5">
                      <button
                        onClick={() => onAddNote(o.id)}
                        className="rounded-md border border-line-strong bg-surface px-3 py-2 text-[11px] text-ink-soft"
                      >
                        Add note
                      </button>
                      <button
                        onClick={() => handleMessageFamily(o.id, o.patientId)}
                        disabled={familyStatus[o.id] === "sending"}
                        className="rounded-md border border-line-strong bg-surface px-3 py-2 text-[11px] text-ink-soft disabled:opacity-60"
                      >
                        Message family
                      </button>
                      {familyStatus[o.id] === "sending" && (
                        <span className="self-center text-[10px] text-muted">Drafting…</span>
                      )}
                      {familyStatus[o.id] === "sent" && (
                        <span className="self-center text-[10px] text-teal">
                          Draft sent to Approvals ✓
                        </span>
                      )}
                      {familyStatus[o.id] === "error" && (
                        <span className="self-center text-[10px] text-critical">
                          Couldn&apos;t send — try again
                        </span>
                      )}
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
          </Pulse>
        );
      })}

      {sorted.length === 0 && (
        <div className="mt-4 rounded-md border border-dashed border-line-strong py-8 text-center text-xs text-muted">
          No orders match.
        </div>
      )}
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
