"use client";

import { useState } from "react";
import Link from "next/link";
import type { Order, Patient } from "@/lib/contracts";
import { RX_SPEND } from "@/lib/data/stub-seed";
import { dmeSpendFor, openDmeLabel } from "./derive";

const STATUS_LABEL: Record<Patient["status"], string> = {
  active: "Active",
  discharged: "Discharged",
  deceased: "Deceased",
};

// Turn 2, 2a/2b: one row per patient, closed rows carry data only — the
// chevron is the whole affordance. Actions only exist inside the open
// row, and the irreversible one still gets its own confirm step.
export function PatientsTab({
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

  const q = query.trim().toLowerCase();
  const visible = q
    ? patients.filter(
        (p) => p.label.toLowerCase().includes(q) || p.id.toLowerCase().includes(q),
      )
    : patients;

  return (
    <div className="p-5">
      <div className="flex items-center gap-3 mb-3.5">
        <div className="text-lg font-semibold text-ink">Patients</div>
        <div className="text-xs text-muted">{patients.length} on census · synthetic data</div>
        <div className="ml-auto flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search patient / asset ID"
            className="rounded-md border border-dashed border-line-strong bg-page px-3 py-2 text-[11px] text-ink placeholder:text-muted"
          />
          <button
            onClick={() => onNewOrder(visible[0]?.id ?? patients[0]?.id)}
            className="rounded-md bg-brand px-3.5 py-2 text-[11px] font-semibold text-white"
          >
            New order
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[14px_1.5fr_.9fr_.9fr_.8fr_.8fr_18px] gap-2.5 border-b border-line pb-2 text-[9px] uppercase tracking-wide text-muted">
        <div />
        <div>Patient</div>
        <div>Census</div>
        <div>Open DME</div>
        <div>DME spend</div>
        <div>Rx spend</div>
        <div />
      </div>

      {visible.map((p) => {
        const patientOrders = orders.filter((o) => o.patientId === p.id);
        const isOpen = expanded === p.id;
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
              <span className="text-[11px]">${dmeSpendFor(patientOrders).toLocaleString()}</span>
              <span className="text-[11px]">${(RX_SPEND[p.id] ?? 0).toLocaleString()}</span>
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
                              {it.assetId && (
                                <span className="font-mono text-[9px] text-muted">{it.assetId}</span>
                              )}
                              <span
                                className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                                  o.state === "pickup_triggered" || o.state === "pickup_delayed"
                                    ? "bg-line text-ink-soft"
                                    : o.state === "delivered"
                                      ? "bg-teal/15 text-teal"
                                      : "bg-cream text-ink"
                                }`}
                              >
                                {o.state === "pickup_triggered" ? "Pickup triggered" : o.state.replace(/_/g, " ")}
                              </span>
                            </div>
                          )),
                        )}
                      </div>
                    )}
                    {patientOrders.some((o) => o.note) && (
                      <>
                        <div className="mt-3.5 mb-1.5 text-[9px] uppercase tracking-wide text-muted">
                          Note
                        </div>
                        <div className="rounded-md border border-line bg-surface px-3 py-2 text-[11px] leading-relaxed text-ink">
                          {patientOrders.find((o) => o.note)?.note}
                        </div>
                      </>
                    )}
                  </div>

                  <div>
                    <div className="mb-2 text-[9px] uppercase tracking-wide text-muted">Record</div>
                    <div className="rounded-md border border-line bg-surface p-3 text-[11px] leading-loose text-ink">
                      {patientOrders[0] && (
                        <Row label="Address" value={patientOrders[0].address} />
                      )}
                      {patientOrders[0] && (
                        <Row label="Vendor" value={vendorName(patientOrders[0].vendorId)} />
                      )}
                      {patientOrders.some((o) => o.pickup) && (
                        <>
                          <Row
                            label="Pickup triggered"
                            value={`by ${patientOrders.find((o) => o.pickup)?.pickup?.triggeredBy}`}
                          />
                          <Row
                            label="Pickup due"
                            value={new Date(
                              patientOrders.find((o) => o.pickup)!.pickup!.dueAt,
                            ).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}
                          />
                        </>
                      )}
                      {p.familyToken && (
                        <Row label="Family tracker" value={`/f/${p.familyToken}`} />
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
                        onClick={() => {
                          const target = patientOrders[0];
                          if (target) onAddNote(target.id);
                        }}
                        className="rounded-md border border-line-strong bg-surface px-3 py-2 text-[11px] text-ink-soft"
                      >
                        Add note
                      </button>
                      <button
                        onClick={() => onMessageFamily(p.id)}
                        className="rounded-md border border-line-strong bg-surface px-3 py-2 text-[11px] text-ink-soft"
                      >
                        Message family
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex">
      <span className="min-w-[110px] text-ink-soft">{label}</span>
      <span>{value}</span>
    </div>
  );
}
