"use client";

import { useState } from "react";
import Link from "next/link";
import type { Order, Patient } from "@/lib/contracts";
import { RX_SPEND } from "@/lib/data/catalog";
import {
  daysOnRent,
  dmeSpendFor,
  idlePickupDays,
  openDmeLabel,
  orderDailyRate,
  PILL_CLASS,
  STATE_LABEL,
} from "./derive";

const STATUS_LABEL: Record<Patient["status"], string> = {
  active: "Active",
  discharged: "Discharged",
  deceased: "Deceased",
};

interface TimelineEntry {
  at: string;
  label: string;
}

function buildTimeline(orders: Order[], vendorName: (id: string) => string): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  for (const o of orders) {
    const items = o.items.map((i) => i.name.split(",")[0]).join(" + ");
    for (const [state, at] of Object.entries(o.timestamps)) {
      if (!at) continue;
      entries.push({
        at,
        label:
          state === "delivered"
            ? `${items} delivered · ${vendorName(o.vendorId)}`
            : `${items} — ${STATE_LABEL[state as keyof typeof STATE_LABEL] ?? state}`,
      });
    }
    if (o.pickup && !o.pickup.completedAt) {
      entries.push({ at: o.pickup.dueAt, label: `${items} — pickup due` });
    }
  }
  return entries.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

// Wireframe turn 3, 3b: the census, but DME-first — assets, days on
// rent, cost per day — instead of turn 2's Open DME / Rx spend columns.
// Same expand-in-place pattern as 2b.
export function PatientList({
  patients,
  orders,
  vendorName,
  onNewOrder,
  onRecordPassing,
  onAddNote,
  onMessageFamily,
}: {
  patients: Patient[];
  orders: Order[];
  vendorName: (id: string) => string;
  onNewOrder: (patientId: string) => void;
  onRecordPassing: (patientId: string) => void;
  onAddNote: (orderId: string) => void;
  onMessageFamily: (patientId: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | Patient["status"]>("All");

  const q = query.trim().toLowerCase();
  const visible = patients
    .filter((p) => statusFilter === "All" || p.status === statusFilter)
    .filter((p) => !q || p.label.toLowerCase().includes(q) || p.id.toLowerCase().includes(q));

  const spendByPatient = new Map(
    patients.map((p) => [p.id, dmeSpendFor(orders.filter((o) => o.patientId === p.id))]),
  );
  const withSpend = Array.from(spendByPatient.values()).filter((v) => v > 0);
  const avgSpend = withSpend.length
    ? withSpend.reduce((s, v) => s + v, 0) / withSpend.length
    : 0;

  const activeCount = patients.filter((p) => p.status === "active").length;
  const deceasedCount = patients.filter((p) => p.status === "deceased").length;

  return (
    <div className="p-5">
      <div className="mb-3.5 flex flex-wrap items-center gap-1.5 text-[10px]">
        <Chip active={statusFilter === "All"} onClick={() => setStatusFilter("All")}>
          All {patients.length}
        </Chip>
        <Chip active={statusFilter === "active"} onClick={() => setStatusFilter("active")}>
          Active {activeCount}
        </Chip>
        {deceasedCount > 0 && (
          <Chip active={statusFilter === "deceased"} onClick={() => setStatusFilter("deceased")}>
            Deceased {deceasedCount}
          </Chip>
        )}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search patient / asset ID"
          className="ml-auto rounded-full border border-dashed border-line-strong bg-page px-3 py-1.5 text-[11px] text-ink placeholder:text-muted"
        />
        <button
          onClick={() => onNewOrder(visible[0]?.id ?? patients[0]?.id)}
          className="rounded-md bg-brand px-3.5 py-1.5 text-[11px] font-semibold text-white"
        >
          New order
        </button>
      </div>
      <div className="grid grid-cols-[14px_1.5fr_.9fr_.9fr_.8fr_.8fr_18px] gap-2.5 border-b border-line pb-2 text-[9px] uppercase tracking-wide text-muted">
        <div />
        <div>Patient</div>
        <div>Census</div>
        <div>Assets</div>
        <div>DME spend</div>
        <div>Days on DME</div>
        <div />
      </div>

      {visible.map((p) => {
        const patientOrders = orders.filter((o) => o.patientId === p.id);
        const isOpen = expanded === p.id;
        const spend = spendByPatient.get(p.id) ?? 0;
        const days = patientOrders.reduce((s, o) => s + daysOnRent(o), 0);
        const currentDailyRate = patientOrders
          .filter((o) => o.timestamps.delivered && !o.pickup?.completedAt)
          .reduce((s, o) => s + orderDailyRate(o), 0);
        const idleDailyRate = patientOrders
          .filter((o) => idlePickupDays(o) > 0)
          .reduce((s, o) => s + orderDailyRate(o), 0);
        const vsAvgPct = avgSpend > 0 ? Math.round(((spend - avgSpend) / avgSpend) * 100) : 0;

        return (
          <div key={p.id}>
            <button
              onClick={() => setExpanded(isOpen ? null : p.id)}
              className="grid w-full grid-cols-[14px_1.5fr_.9fr_.9fr_.8fr_.8fr_18px] items-center gap-2.5 border-b border-line py-3.5 text-left text-xs text-ink"
            >
              <span
                className={`h-[30px] w-[5px] rounded-sm ${isOpen ? "bg-secondary" : "bg-line"}`}
              />
              <span>
                <span className="block font-medium">{p.label}</span>
                <span className="block text-[10px] text-muted">{p.id}</span>
              </span>
              <span className="text-[11px] text-ink-soft">{STATUS_LABEL[p.status]}</span>
              <span className="text-[11px]">{openDmeLabel(patientOrders)}</span>
              <span className="text-[11px]">${spend.toLocaleString()}</span>
              <span className="text-[11px]">{Math.round(days)}</span>
              <span className="text-right text-[13px] text-muted">{isOpen ? "⌄" : "›"}</span>
            </button>

            {isOpen && (
              <div className="mb-2.5 rounded-xl border border-line bg-page p-4 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <div className="mb-2 text-[9px] uppercase tracking-wide text-muted">
                      Assets on site
                    </div>
                    {patientOrders.length === 0 ? (
                      <div className="text-[11px] text-muted">No orders on file.</div>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {patientOrders.map((o) =>
                          o.items.map((it) => (
                            <div
                              key={`${o.id}-${it.hcpcs}`}
                              className="flex items-center gap-2.5 rounded-md border border-line bg-surface px-3 py-2 text-[11px]"
                            >
                              <span className="font-mono text-[10px] text-muted">{it.hcpcs}</span>
                              <span className="flex-1 text-ink">{it.name}</span>
                              <span className="text-[9px] text-muted">
                                {Math.round(daysOnRent(o))} d · ${Math.round(orderDailyRate(o) * 30)}/mo
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${PILL_CLASS[o.state]}`}
                              >
                                {o.state === "pickup_triggered" ? "Pickup triggered" : o.state.replace(/_/g, " ")}
                              </span>
                            </div>
                          )),
                        )}
                      </div>
                    )}

                    <div className="mt-3.5 mb-1.5 text-[9px] uppercase tracking-wide text-muted">
                      Timeline
                    </div>
                    <div className="rounded-md border border-line bg-surface p-3 text-[10.5px] leading-relaxed text-ink">
                      {buildTimeline(patientOrders, vendorName).map((e, i) => (
                        <div key={i} className="flex">
                          <span className="min-w-[74px] font-mono text-ink-soft">
                            {new Date(e.at).toLocaleDateString([], { month: "short", day: "numeric" })}
                          </span>
                          <span>{e.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-[9px] uppercase tracking-wide text-muted">
                      Cost to date
                    </div>
                    <div className="rounded-md border border-line bg-surface p-3 text-[11px] leading-loose text-ink">
                      <Row label="DME to date" value={`$${spend.toLocaleString()}`} strong />
                      <Row label="Per day" value={`$${currentDailyRate.toFixed(0)}`} />
                      <Row
                        label="Vs census avg"
                        value={avgSpend > 0 ? `${vsAvgPct >= 0 ? "+" : ""}${vsAvgPct}%` : "—"}
                        critical={vsAvgPct > 0}
                      />
                      {idleDailyRate > 0 && (
                        <Row
                          label="Idle rental risk"
                          value={`$${idleDailyRate.toFixed(2)}/day past pickup`}
                          critical
                        />
                      )}
                      {patientOrders[0] && (
                        <Row label="Vendor" value={vendorName(patientOrders[0].vendorId)} />
                      )}
                    </div>

                    <div className="mt-3.5 flex flex-wrap justify-end gap-1.5">
                      {p.familyToken && (
                        <Link
                          href={`/f/${p.familyToken}`}
                          target="_blank"
                          className="rounded-md border border-line-strong bg-surface px-3 py-2 text-[11px] text-ink-soft"
                        >
                          Open family tracker
                        </Link>
                      )}
                      <button
                        onClick={() => onMessageFamily(p.id)}
                        className="rounded-md border border-line-strong bg-surface px-3 py-2 text-[11px] text-ink-soft"
                      >
                        Message family
                      </button>
                      <button
                        onClick={() => {
                          const target = patientOrders[0];
                          if (target) onAddNote(target.id);
                        }}
                        className="rounded-md border border-line-strong bg-surface px-3 py-2 text-[11px] text-ink-soft"
                      >
                        Add note
                      </button>
                      <button
                        onClick={() => onNewOrder(p.id)}
                        className="rounded-md border border-line-strong bg-surface px-3 py-2 text-[11px] text-ink-soft"
                      >
                        New order
                      </button>
                      {p.status === "active" && (
                        <button
                          onClick={() => onRecordPassing(p.id)}
                          className="rounded-md border-[1.5px] border-critical bg-surface px-3 py-2 text-[11px] font-medium text-critical"
                        >
                          Record passing
                        </button>
                      )}
                    </div>
                    <div className="mt-2.5 text-[9px] text-muted">
                      Rx spend: ${(RX_SPEND[p.id] ?? 0).toLocaleString()} (not DME — shown on
                      the census, dropped here per the DME-only Equipment tab)
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {visible.length === 0 && (
        <div className="mt-4 rounded-md border border-dashed border-line-strong py-8 text-center text-xs text-muted">
          No patients match &quot;{query}&quot;.
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

function Row({
  label,
  value,
  strong,
  critical,
}: {
  label: string;
  value: string;
  strong?: boolean;
  critical?: boolean;
}) {
  return (
    <div className="flex">
      <span className="min-w-[120px] text-ink-soft">{label}</span>
      <span className={`${strong ? "font-semibold" : ""} ${critical ? "text-critical" : ""}`}>
        {value}
      </span>
    </div>
  );
}
