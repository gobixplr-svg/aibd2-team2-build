"use client";

import { useState } from "react";
import type { OnHandAsset, OnHandState, Patient } from "@/lib/contracts";
import { ON_HAND_CYCLE } from "@/lib/contracts";
import { EQUIPMENT } from "@/lib/data/catalog";

// build-plan item 10: small/portable equipment (walkers, wheelchairs,
// commodes) hospices commonly keep on-site as vendor-owned consignment
// stock — a second fulfillment path alongside the existing vendor-dispatch
// flow. Vendor retains title throughout; the hospice can't profit on it,
// and the patient keeps vendor choice. Beds, oxygen, and mattresses never
// appear here — they're warehouse-dispatched only, and this tab only ever
// renders whatever the seed/API actually hands it, so there's nothing to
// filter out by hand.
//
// Same sub-tab pattern as List/By-patient: Chip filters, a search input,
// an expand-in-place row for the one interaction this tab has — advancing
// an asset one step through at-warehouse → in-transit → on-hand →
// deployed → pending-pickup → in-transit-return → maintenance → (loop).

const STATE_LABEL: Record<OnHandState, string> = {
  at_warehouse: "At warehouse",
  in_transit: "In transit",
  on_hand: "On-hand",
  deployed: "Deployed",
  pending_pickup: "Pending pickup",
  in_transit_return: "In transit (return)",
  maintenance: "Maintenance",
};

// Deliberately not amber/critical — those are reserved for order-level
// At-Risk / Pickup-Delayed elsewhere. Asset lifecycle here is routine
// operations, not a risk signal.
const STATE_CLASS: Record<OnHandState, string> = {
  at_warehouse: "bg-line-strong text-ink-soft",
  in_transit: "bg-teal text-navy",
  on_hand: "bg-secondary text-white",
  deployed: "bg-navy text-white",
  pending_pickup: "bg-teal text-navy",
  in_transit_return: "bg-teal text-navy",
  maintenance: "bg-line-strong text-ink-soft",
};

const RAIL_CLASS: Record<OnHandState, string> = {
  at_warehouse: "bg-line-strong",
  in_transit: "bg-teal",
  on_hand: "bg-secondary",
  deployed: "bg-navy",
  pending_pickup: "bg-teal",
  in_transit_return: "bg-teal",
  maintenance: "bg-line-strong",
};

function daysInState(updatedAt: string, now: number): number {
  return Math.max(Math.floor((now - new Date(updatedAt).getTime()) / 86_400_000), 0);
}

export function OnHandList({
  assets,
  patients,
  vendorName,
  now,
  onAdvance,
}: {
  assets: OnHandAsset[];
  patients: Patient[];
  vendorName: (id: string) => string;
  now: number;
  onAdvance: (assetId: string, patientId?: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [deployPatient, setDeployPatient] = useState<Record<string, string>>({});

  const codes = Array.from(new Set(assets.map((a) => a.hcpcs)));
  const q = query.trim().toLowerCase();
  const visible = assets
    .filter((a) => category === "All" || a.hcpcs === category)
    .filter(
      (a) =>
        !q ||
        a.id.toLowerCase().includes(q) ||
        EQUIPMENT[a.hcpcs]?.name.toLowerCase().includes(q) ||
        vendorName(a.vendorId).toLowerCase().includes(q),
    )
    .sort((a, b) => a.hcpcs.localeCompare(b.hcpcs) || a.id.localeCompare(b.id));

  const onHandCounts = new Map<string, number>();
  for (const a of assets) {
    if (a.state === "on_hand") onHandCounts.set(a.hcpcs, (onHandCounts.get(a.hcpcs) ?? 0) + 1);
  }

  const activePatients = patients.filter((p) => p.status === "active");

  return (
    <div className="p-5">
      <div className="mb-3.5 rounded-lg border border-dashed border-line-strong bg-page px-3 py-2 text-[12.5px] leading-relaxed text-ink-soft">
        Small/portable equipment kept on-site as vendor-owned consignment stock — walkers,
        wheelchairs, commodes. Beds, oxygen, and pressure mattresses are always vendor-dispatched,
        never on-hand.
      </div>

      <div className="mb-3.5 flex flex-wrap items-center gap-1.5 text-[12px]">
        <Chip active={category === "All"} onClick={() => setCategory("All")}>
          All {assets.length}
        </Chip>
        {codes.map((c) => (
          <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
            {EQUIPMENT[c]?.name ?? c} · {onHandCounts.get(c) ?? 0} in stock
          </Chip>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search asset ID / vendor"
          className="ml-auto rounded-full border border-dashed border-line-strong bg-page px-3 py-1.5 text-[13px] text-ink placeholder:text-muted"
        />
      </div>

      <div className="grid grid-cols-[14px_1fr_18px] gap-2.5 border-b border-line pb-2 text-[11px] uppercase tracking-wide text-muted sm:grid-cols-[14px_1.3fr_.9fr_1fr_.9fr_.6fr_18px]">
        <div />
        <div>
          <span className="sm:hidden">Item · state</span>
          <span className="hidden sm:inline">Item</span>
        </div>
        <div className="hidden sm:block">Vendor</div>
        <div className="hidden sm:block">State</div>
        <div className="hidden sm:block">Patient</div>
        <div className="hidden sm:block">Days in state</div>
        <div />
      </div>

      {visible.map((a) => {
        const isOpen = expanded === a.id;
        const next = ON_HAND_CYCLE[a.state];
        const patient = a.patientId ? patients.find((p) => p.id === a.patientId) : undefined;

        return (
          <div key={a.id}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => setExpanded(isOpen ? null : a.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setExpanded(isOpen ? null : a.id);
                }
              }}
              className="grid w-full cursor-pointer grid-cols-[14px_1fr_18px] items-center gap-2.5 border-b border-line py-3 text-left text-[13px] text-ink sm:grid-cols-[14px_1.3fr_.9fr_1fr_.9fr_.6fr_18px]"
            >
              <span className={`h-8 w-[5px] rounded-sm ${RAIL_CLASS[a.state]}`} />
              <span>
                <span className="block font-medium">{EQUIPMENT[a.hcpcs]?.name ?? a.hcpcs}</span>
                <span className="hidden font-mono text-[11px] text-muted sm:block">
                  {a.hcpcs} · {a.id}
                </span>
                {/* Vendor/Patient/Days-in-state drop below sm — state pill rides
                    with the code+id line instead, so lifecycle still reads
                    without a tap. All three reappear in the Detail block below. */}
                <span className="mt-1 flex items-center gap-1.5 sm:hidden">
                  <span
                    className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${STATE_CLASS[a.state]}`}
                  >
                    {STATE_LABEL[a.state]}
                  </span>
                  <span className="whitespace-nowrap font-mono text-[11px] text-ink-soft">
                    {a.hcpcs} · {a.id}
                  </span>
                </span>
              </span>
              <span className="hidden text-[12px] text-ink-soft sm:block">{vendorName(a.vendorId)}</span>
              <span className="hidden sm:block">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${STATE_CLASS[a.state]}`}
                >
                  {STATE_LABEL[a.state]}
                </span>
              </span>
              <span className="hidden text-[12px] text-ink-soft sm:block">{patient?.label ?? "—"}</span>
              <span className="hidden text-[12px] sm:block">{daysInState(a.updatedAt, now)}d</span>
              <span className="text-right text-muted">{isOpen ? "⌄" : "›"}</span>
            </div>

            {isOpen && (
              <div
                className="mb-2.5 rounded-xl border border-line bg-page p-4 shadow-sm"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Detail block: Vendor/Patient/Days-in-state live here at every
                    width, not just below sm — a detail view whose facts change
                    by breakpoint is a bug waiting to happen. */}
                <div className="mb-2 text-[11px] uppercase tracking-wide text-muted">Detail</div>
                <div className="mb-3.5 rounded-md border border-line bg-surface p-3 text-[13px] leading-loose text-ink">
                  <div className="flex">
                    <span className="min-w-[96px] text-ink-soft">Vendor</span>
                    <span>{vendorName(a.vendorId)}</span>
                  </div>
                  <div className="flex">
                    <span className="min-w-[96px] text-ink-soft">Patient</span>
                    <span>{patient?.label ?? "—"}</span>
                  </div>
                  <div className="flex">
                    <span className="min-w-[96px] text-ink-soft">Days in state</span>
                    <span>{daysInState(a.updatedAt, now)}d</span>
                  </div>
                </div>

                <div className="mb-2 text-[11px] uppercase tracking-wide text-muted">
                  Lifecycle · vendor retains title throughout
                </div>
                <div className="mb-3.5 flex flex-wrap gap-1.5">
                  {(Object.keys(STATE_LABEL) as OnHandState[]).map((s) => (
                    <span
                      key={s}
                      className={`rounded px-1.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                        s === a.state ? "bg-navy text-white" : "bg-line text-ink-soft"
                      }`}
                    >
                      {STATE_LABEL[s]}
                    </span>
                  ))}
                </div>

                {next === "deployed" ? (
                  <div className="flex flex-col gap-2">
                    <select
                      value={deployPatient[a.id] ?? ""}
                      onChange={(e) =>
                        setDeployPatient((d) => ({ ...d, [a.id]: e.target.value }))
                      }
                      className="rounded-md border border-line-strong bg-surface px-2.5 py-2.5 text-[13px] text-ink"
                    >
                      <option value="">Choose patient…</option>
                      {activePatients.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        const pid = deployPatient[a.id];
                        if (pid) onAdvance(a.id, pid);
                      }}
                      disabled={!deployPatient[a.id]}
                      className="rounded-md bg-brand px-3.5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40"
                    >
                      Deploy to patient
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => onAdvance(a.id)}
                    className="rounded-md bg-brand px-3.5 py-2.5 text-[13px] font-semibold text-white"
                  >
                    Advance to {STATE_LABEL[next]}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {visible.length === 0 && (
        <div className="mt-4 rounded-md border border-dashed border-line-strong py-8 text-center text-sm text-muted">
          No on-hand assets match.
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
