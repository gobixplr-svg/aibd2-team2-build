"use client";

import { useState } from "react";
import Link from "next/link";
import type { Order, Patient } from "@/lib/contracts";
import { DraftCard } from "./draft-card";
import {
  daysOnRent,
  dmeSpendFor,
  idlePickupDays,
  openDmeLabel,
  orderDailyRate,
  orderNeedsAttention,
  PILL_CLASS,
  pillFor,
  postPickupIdleCost,
  STATE_LABEL,
  type InboxItem,
} from "./derive";

// Highest-severity open risk across a patient's orders, reusing the exact
// order-pill colors so this reads as the same signal, just rolled up.
function patientRisk(patientOrders: Order[]): { label: string; className: string } | null {
  // Completed pickups resolve the risk even though state stays
  // pickup_delayed — count only orders that still need a human.
  const open = patientOrders.filter(orderNeedsAttention);
  const pickupDelayed = open.filter((o) => o.state === "pickup_delayed").length;
  if (pickupDelayed > 0) return { label: `${pickupDelayed} pickup delayed`, className: PILL_CLASS.pickup_delayed };
  const atRisk = open.filter((o) => o.state === "at_risk").length;
  if (atRisk > 0) return { label: `${atRisk} at risk`, className: PILL_CLASS.at_risk };
  return null;
}

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
// Same expand-in-place pattern as 2b. Turn 4 (4a/4b): diagnosis tag and
// risk rollup replace the plain status column, the family tracker link
// moves onto the collapsed row. Turn 4 also deleted Rx spend entirely,
// on the (wrong) assumption this app should stay DME-only — the bounty's
// own Required Features list states "DME spend alongside medication
// spend, not in a separate silo" verbatim, so it's back here and in
// Analytics, seeded per patient rather than a hardcoded partial table.
export function PatientList({
  patients,
  orders,
  vendorName,
  now,
  inbox,
  onNewOrder,
  onRecordPassing,
  onAddNote,
  onMessageFamily,
  onApproveDraft,
  onDismissDraft,
}: {
  patients: Patient[];
  orders: Order[];
  now: number;
  vendorName: (id: string) => string;
  inbox: InboxItem[];
  onNewOrder: (patientId: string) => void;
  onRecordPassing: (patientId: string) => void;
  onAddNote: (orderId: string) => void;
  onMessageFamily: (patientId: string) => Promise<boolean>;
  onApproveDraft: (id: string, draft?: string) => void;
  onDismissDraft: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | Patient["status"]>("All");
  const [familyStatus, setFamilyStatus] = useState<Record<string, "sending" | "sent" | "error">>(
    {},
  );

  async function handleMessageFamily(patientId: string) {
    setFamilyStatus((s) => ({ ...s, [patientId]: "sending" }));
    const ok = await onMessageFamily(patientId);
    setFamilyStatus((s) => ({ ...s, [patientId]: ok ? "sent" : "error" }));
    setTimeout(() => {
      setFamilyStatus((s) => {
        const { [patientId]: _drop, ...rest } = s;
        return rest;
      });
    }, 3000);
  }

  const q = query.trim().toLowerCase();
  // Stable census order. The store reads rows unordered (Postgres moves an
  // updated row to the end of the heap), so without this sort any patient
  // you touch — Record passing, a note — sinks to the bottom of the list.
  const visible = patients
    .filter((p) => statusFilter === "All" || p.status === statusFilter)
    .filter((p) => !q || p.label.toLowerCase().includes(q) || p.id.toLowerCase().includes(q))
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  const spendByPatient = new Map(
    patients.map((p) => [p.id, dmeSpendFor(orders.filter((o) => o.patientId === p.id), now)]),
  );
  const withSpend = Array.from(spendByPatient.values()).filter((v) => v > 0);
  const avgSpend = withSpend.length
    ? withSpend.reduce((s, v) => s + v, 0) / withSpend.length
    : 0;

  const activeCount = patients.filter((p) => p.status === "active").length;
  const deceasedCount = patients.filter((p) => p.status === "deceased").length;

  return (
    <div className="p-5">
      <div className="mb-3.5 flex flex-wrap items-center gap-1.5 text-[12px]">
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
          className="ml-auto rounded-full border border-dashed border-line-strong bg-page px-3 py-1.5 text-[13px] text-ink placeholder:text-muted"
        />
        <button
          onClick={() => onNewOrder(visible[0]?.id ?? patients[0]?.id)}
          className="rounded-md bg-brand px-3.5 py-1.5 text-[13px] font-semibold text-white"
        >
          New order
        </button>
      </div>
      <div className="grid grid-cols-[14px_1fr_18px] gap-2.5 border-b border-line pb-2 text-[11px] uppercase tracking-wide text-muted sm:grid-cols-[14px_1.7fr_1.1fr_.8fr_.95fr_.6fr_54px_18px]">
        <div />
        <div>
          <span className="sm:hidden">Patient · spend · attention</span>
          <span className="hidden sm:inline">Patient</span>
        </div>
        <div className="hidden sm:block">Needs attention</div>
        <div className="hidden sm:block">Assets</div>
        <div className="hidden sm:block">DME + Rx spend</div>
        <div className="hidden sm:block">Days</div>
        <div className="hidden sm:block">Family</div>
        <div />
      </div>

      {visible.map((p) => {
        const patientOrders = orders.filter((o) => o.patientId === p.id);
        const isOpen = expanded === p.id;
        const spend = spendByPatient.get(p.id) ?? 0;
        const days = patientOrders.reduce((s, o) => s + daysOnRent(o, now), 0);
        const currentDailyRate = patientOrders
          .filter((o) => o.timestamps.delivered && !o.pickup?.completedAt)
          .reduce((s, o) => s + orderDailyRate(o), 0);
        // "Accruing" is present tense — only orders still awaiting pickup
        // count, not ones where a late pickup already happened and closed.
        const openIdleOrders = patientOrders.filter((o) => o.pickup && !o.pickup.completedAt);
        const idleCostForPatient = postPickupIdleCost(openIdleOrders, now);
        const vsAvgPct = avgSpend > 0 ? Math.round(((spend - avgSpend) / avgSpend) * 100) : 0;
        const risk = patientRisk(patientOrders);

        return (
          <div key={p.id}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => setExpanded(isOpen ? null : p.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setExpanded(isOpen ? null : p.id);
                }
              }}
              className="grid w-full cursor-pointer grid-cols-[14px_1fr_18px] items-center gap-2.5 border-b border-line py-3.5 text-left text-sm text-ink sm:grid-cols-[14px_1.7fr_1.1fr_.8fr_.95fr_.6fr_54px_18px]"
            >
              <span
                className={`h-[30px] w-[5px] rounded-sm ${isOpen ? "bg-secondary" : "bg-line"}`}
              />
              <span>
                <span className="flex items-baseline gap-2">
                  <span className="font-medium">{p.label}</span>
                  {p.dx && (
                    <span className="rounded border border-line px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-ink-soft">
                      {p.dx}
                    </span>
                  )}
                  <span className="hidden text-[12px] text-muted sm:inline">{p.id}</span>
                </span>
                {/* Assets/Days/Family drop below sm — cost-of-care is the selling
                    point, so spend (with its vs-average delta) earns this line
                    instead; the risk pill rides along when there is one. */}
                <span className="mt-1 flex flex-wrap items-center gap-1.5 sm:hidden">
                  <span className="whitespace-nowrap text-[11px] text-ink-soft">
                    ${spend.toLocaleString()} DME
                    {avgSpend > 0 && ` · ${vsAvgPct >= 0 ? "+" : ""}${vsAvgPct}% vs avg`}
                  </span>
                  {risk && (
                    <span
                      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${risk.className}`}
                    >
                      {risk.label}
                    </span>
                  )}
                </span>
              </span>
              <span className="hidden sm:block">
                {risk && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${risk.className}`}
                  >
                    {risk.label}
                  </span>
                )}
              </span>
              <span className="hidden text-[13px] sm:block">{openDmeLabel(patientOrders)}</span>
              <span className="hidden text-[13px] sm:block">
                <span>
                  ${spend.toLocaleString()} DME
                  {avgSpend > 0 && (
                    <span className="ml-1 text-[11px] text-ink-soft">
                      {vsAvgPct >= 0 ? "+" : ""}
                      {vsAvgPct}%
                    </span>
                  )}
                </span>
                {p.rxSpendMonthly !== undefined && (
                  <span className="block text-[11px] text-ink-soft">
                    ${p.rxSpendMonthly.toLocaleString()}/mo Rx
                  </span>
                )}
              </span>
              <span className="hidden text-[13px] sm:block">{Math.round(days)}</span>
              <span className="hidden text-[12px] text-ink-soft sm:block">
                {p.familyToken ? (
                  <Link
                    href={`/f/${p.familyToken}`}
                    target="_blank"
                    onClick={(e) => e.stopPropagation()}
                    className="hover:text-teal"
                  >
                    Tracker ↗
                  </Link>
                ) : (
                  "—"
                )}
              </span>
              <span className="text-right text-[15px] text-muted">{isOpen ? "⌄" : "›"}</span>
            </div>

            {isOpen && (
              <div className="mb-2.5 rounded-xl border border-line bg-page p-4 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <div className="mb-2 text-[11px] uppercase tracking-wide text-muted">
                      {/* Only delivered-and-not-picked-up items are IN the
                          home — calling an ordered item "on site" put this
                          panel out of sync with the vendor and family views. */}
                      Equipment ·{" "}
                      {patientOrders
                        .filter((o) => o.timestamps.delivered && !o.pickup?.completedAt)
                        .reduce((s, o) => s + o.items.length, 0)}{" "}
                      of {patientOrders.reduce((s, o) => s + o.items.length, 0)} in the home
                    </div>
                    {patientOrders.length === 0 ? (
                      <div className="text-[13px] text-muted">No orders on file.</div>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {patientOrders.map((o) => (
                          <div key={o.id} className="flex flex-col gap-1.5">
                            {o.items.map((it) => (
                              <div
                                key={`${o.id}-${it.hcpcs}`}
                                className="flex items-center gap-2.5 rounded-md border border-line bg-surface px-3 py-2 text-[13px]"
                              >
                                <span className="font-mono text-[12px] text-muted">{it.hcpcs}</span>
                                <span className="flex-1 text-ink">{it.name}</span>
                                <span className="text-[11px] text-muted">
                                  {Math.round(daysOnRent(o, now))} d · ${Math.round(orderDailyRate(o) * 30)}/mo
                                </span>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${pillFor(o).className}`}
                                >
                                  {pillFor(o).label}
                                </span>
                              </div>
                            ))}
                            {o.note && (
                              <div className="rounded-md border border-dashed border-line-strong bg-page px-3 py-2 text-[12.5px] leading-relaxed text-ink-soft">
                                <span className="mr-1 text-[11px] uppercase tracking-wide text-muted">
                                  Note ·
                                </span>
                                {o.note}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {openIdleOrders
                      .filter((o) => idlePickupDays(o, now) > 0)
                      .map((o) => {
                        const overdueDays = idlePickupDays(o, now);
                        const rate = orderDailyRate(o);
                        const hours = Math.round(
                          (now - new Date(o.pickup!.dueAt).getTime()) / 3_600_000,
                        );
                        const hcpcs = o.items.map((it) => it.hcpcs).join(" + ");
                        return (
                          <div
                            key={o.id}
                            className="mt-3 rounded-md border border-critical bg-surface p-3 text-[13px] leading-relaxed text-ink"
                          >
                            <div>
                              Pickup overdue {hours}h —{" "}
                              <span className="font-semibold">${(overdueDays * rate).toFixed(2)}</span>{" "}
                              accrued past the 24-hour window.
                            </div>
                            <div className="mt-1.5 text-[12px] text-ink-soft">
                              {overdueDays} overdue day{overdueDays === 1 ? "" : "s"} × $
                              {rate.toFixed(2)}/day · CMS rate for {hcpcs}
                            </div>
                          </div>
                        );
                      })}

                    <div className="mt-3.5 mb-1.5 text-[11px] uppercase tracking-wide text-muted">
                      Timeline
                    </div>
                    <div className="rounded-md border border-line bg-surface p-3 text-[12.5px] leading-relaxed text-ink">
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
                    <div className="mb-2 text-[11px] uppercase tracking-wide text-muted">
                      Cost to date
                    </div>
                    <div className="rounded-md border border-line bg-surface p-3 text-[13px] leading-loose text-ink">
                      <Row label="DME to date" value={`$${spend.toLocaleString()}`} strong />
                      <Row
                        label="Rx spend (mo.)"
                        value={
                          p.rxSpendMonthly !== undefined ? `$${p.rxSpendMonthly.toLocaleString()}` : "—"
                        }
                      />
                      <Row label="Per day" value={`$${currentDailyRate.toFixed(0)}`} />
                      <Row
                        label="Vs census avg"
                        value={avgSpend > 0 ? `${vsAvgPct >= 0 ? "+" : ""}${vsAvgPct}%` : "—"}
                        critical={vsAvgPct > 0}
                      />
                      {idleCostForPatient > 0 && (
                        <Row
                          label="Overdue rental"
                          value={`$${idleCostForPatient.toFixed(2)} accruing`}
                          critical
                        />
                      )}
                      {patientOrders[0] && (
                        <Row label="Vendor" value={vendorName(patientOrders[0].vendorId)} />
                      )}
                    </div>

                    <div className="mt-3.5 flex flex-wrap gap-2 sm:justify-end sm:gap-1.5">
                      {/* Paired 2-up rows on a phone, min-h-[44px] tap targets.
                          Record passing keeps its red outline and stays last —
                          away from the thumb's resting path, same as desktop. */}
                      {p.familyToken && (
                        <Link
                          href={`/f/${p.familyToken}`}
                          target="_blank"
                          className="flex min-h-[44px] flex-1 basis-[45%] items-center justify-center rounded-md border border-line-strong bg-surface px-3 py-2 text-[13px] text-ink-soft sm:min-h-0 sm:flex-none sm:basis-auto"
                        >
                          Open family tracker
                        </Link>
                      )}
                      <button
                        onClick={() => handleMessageFamily(p.id)}
                        disabled={familyStatus[p.id] === "sending"}
                        className="min-h-[44px] flex-1 basis-[45%] rounded-md border border-line-strong bg-surface px-3 py-2 text-[13px] text-ink-soft disabled:opacity-60 sm:min-h-0 sm:flex-none sm:basis-auto"
                      >
                        Message family
                      </button>
                      {familyStatus[p.id] === "sending" && (
                        <span className="self-center text-[12px] text-muted">Drafting…</span>
                      )}
                      {familyStatus[p.id] === "sent" && (
                        <span className="self-center text-[12px] text-teal">
                          Draft sent to Approvals ✓
                        </span>
                      )}
                      {familyStatus[p.id] === "error" && (
                        <span className="self-center text-[12px] text-critical">
                          Couldn&apos;t send — try again
                        </span>
                      )}
                      {inbox
                        .filter((i) => i.needsApproval && i.draft && i.patientId === p.id)
                        .map((i) => (
                          <div key={i.id} className="w-full">
                            <DraftCard item={i} onApprove={onApproveDraft} onDismiss={onDismissDraft} />
                          </div>
                        ))}
                      <button
                        onClick={() => {
                          const target = patientOrders[0];
                          if (target) onAddNote(target.id);
                        }}
                        className="min-h-[44px] flex-1 basis-[45%] rounded-md border border-line-strong bg-surface px-3 py-2 text-[13px] text-ink-soft sm:min-h-0 sm:flex-none sm:basis-auto"
                      >
                        Add note
                      </button>
                      <button
                        onClick={() => onNewOrder(p.id)}
                        className="min-h-[44px] flex-1 basis-[45%] rounded-md border border-line-strong bg-surface px-3 py-2 text-[13px] text-ink-soft sm:min-h-0 sm:flex-none sm:basis-auto"
                      >
                        New order
                      </button>
                      {p.status === "active" && (
                        <button
                          onClick={() => onRecordPassing(p.id)}
                          className="min-h-[44px] flex-1 basis-[45%] rounded-md border-[1.5px] border-critical bg-surface px-3 py-2 text-[13px] font-medium text-critical sm:min-h-0 sm:flex-none sm:basis-auto"
                        >
                          Record passing
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

      {visible.length === 0 && (
        <div className="mt-4 rounded-md border border-dashed border-line-strong py-8 text-center text-sm text-muted">
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
