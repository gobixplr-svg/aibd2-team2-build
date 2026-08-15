"use client";

import { Fragment, useState } from "react";
import type { Order, OrderState, Patient, Vendor } from "@/lib/contracts";
import { NoteModal } from "./note-modal";

// DME Tracker — patterned after Qualis, the leading third-party DME
// integration for Homecare Homebase (HCHB has no native DME module of
// its own; hospices bolt one on, and Qualis is the market leader).
// Synthetic simulation only — not affiliated with or endorsed by HCHB
// or Qualis. Colors below are HCHB's own (see the style-guide research),
// scoped to this panel only so it reads as "the other system's chrome"
// embedded in ours, not a restyle of the whole app.
const HCHB = {
  navy: "#0d1f3c",
  blue: "#2e6fe0",
  blueSoft: "#5b8ff0",
  powder: "#d7e6fa",
  paper: "#f5f8fc",
  amber: "#ee9a2e",
  critical: "#c0392b",
  good: "#1b8a5a",
};

// Qualis's own documented lifecycle: created, submitted, received,
// modified, accepted, delivered, picked up. Our OrderState is a
// simpler machine, so this maps onto it rather than reproducing all
// seven stages 1:1 — "received"/"modified" don't have a clean analog
// once a vendor has actually committed to an order.
const QUALIS_STATUS: Record<OrderState, { label: string; tone: keyof typeof TONE }> = {
  ordered: { label: "Submitted", tone: "neutral" },
  dispatched: { label: "Accepted", tone: "progress" },
  in_transit: { label: "Accepted · en route", tone: "progress" },
  at_risk: { label: "Accepted · at risk", tone: "warn" },
  delivered: { label: "Delivered", tone: "done" },
  pickup_triggered: { label: "Pickup requested", tone: "pickup" },
  pickup_delayed: { label: "Pickup overdue", tone: "critical" },
};

const TONE: Record<string, React.CSSProperties> = {
  neutral: { background: HCHB.powder, color: HCHB.navy },
  progress: { background: HCHB.blue, color: "#fff" },
  warn: { background: HCHB.amber, color: "#fff" },
  done: { background: HCHB.navy, color: "#fff" },
  pickup: { background: HCHB.blueSoft, color: "#fff" },
  critical: { background: HCHB.critical, color: "#fff" },
};

const ADT_EVENTS = [
  { type: "admit", label: "Admit", to: "active" as const },
  { type: "discharge", label: "Discharge home", to: "discharged" as const },
  { type: "deceased", label: "Mark deceased", to: "deceased" as const },
];

// Real Qualis vendors split into two tiers: ones that log into the portal
// to confirm orders and post status themselves, and ones an office still
// has to phone or email — "the quality of your DME tracking is only as
// good as your vendors' participation." We already model this exact split
// as Vendor.connected; it just wasn't surfaced in this tracker before.
function VendorBadge({ connected }: { connected: boolean }) {
  return connected ? (
    <span
      className="ml-1.5 rounded-full px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-wide"
      style={{ background: HCHB.powder, color: HCHB.navy }}
    >
      Portal
    </span>
  ) : (
    <span className="ml-1.5 rounded-full border border-line-strong px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-wide text-muted">
      Phone/email only
    </span>
  );
}

export function EmrTab({
  patients,
  orders,
  vendors,
  vendorName,
  log,
  onFire,
  onRequestPickup,
}: {
  patients: Patient[];
  orders: Order[];
  vendors: Vendor[];
  vendorName: (id: string) => string;
  log: string[];
  onFire: (patient: Patient, type: string, to: Patient["status"]) => void;
  onRequestPickup: (orderId: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [serviceFlags, setServiceFlags] = useState<Record<string, string>>({});
  const [orderLog, setOrderLog] = useState<string[]>([]);
  const [flagFor, setFlagFor] = useState<Order | null>(null);

  function logOrderEvent(line: string) {
    const time = new Date().toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
    setOrderLog((l) => [`${time} ${line}`, ...l].slice(0, 8));
  }

  function flagServiceIssue(order: Order) {
    setFlagFor(order);
  }

  function saveServiceFlag(note: string) {
    if (flagFor && note) {
      setServiceFlags((f) => ({ ...f, [flagFor.id]: note }));
      logOrderEvent(`Service issue flagged · ${flagFor.id} · ${flagFor.patientLabel} — "${note}"`);
    }
    setFlagFor(null);
  }

  function requestPickup(order: Order) {
    onRequestPickup(order.id);
    logOrderEvent(`Pickup requested · ${order.id} · ${order.patientLabel}`);
  }

  return (
    <div className="p-5">
      <div
        className="overflow-hidden rounded-xl border"
        style={{ borderColor: HCHB.powder }}
      >
        <div
          className="flex items-center gap-2.5 px-5 py-3"
          style={{ background: HCHB.navy }}
        >
          <span className="text-[13px] font-bold tracking-tight text-white">
            home<span style={{ color: HCHB.blueSoft, fontWeight: 700 }}>care</span> home
            <span style={{ color: HCHB.blueSoft, fontWeight: 700 }}>base</span>
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
            style={{ background: HCHB.blueSoft, color: "#fff" }}
          >
            DME Tracker
          </span>
          <span className="ml-auto text-[9px] uppercase tracking-wide text-white/50">
            synthetic simulation
          </span>
        </div>

        <div className="p-5" style={{ background: HCHB.paper }}>
          <p className="mb-1 max-w-2xl text-xs leading-relaxed" style={{ color: HCHB.navy }}>
            Patterned after <strong>Qualis</strong>, the leading third-party DME management
            integration for Homecare Homebase — HCHB has no native DME module, so hospices
            running on it bolt one on. Not affiliated with or endorsed by HCHB or Qualis.
          </p>
          <p className="mb-4 max-w-2xl text-[11px]" style={{ color: "#3a4a63" }}>
            Order status below follows Qualis&apos;s documented lifecycle (created → submitted
            → received → modified → accepted → delivered → picked up), mapped onto our order
            states.
          </p>

          <div className="overflow-hidden rounded-lg border bg-white" style={{ borderColor: HCHB.powder }}>
            <table className="w-full text-[11px]">
              <thead>
                <tr style={{ background: HCHB.powder, color: HCHB.navy }} className="text-left text-[9px] uppercase tracking-wide">
                  <th className="px-3 py-2 font-semibold">Item</th>
                  <th className="px-3 py-2 font-semibold">Patient</th>
                  <th className="px-3 py-2 font-semibold">Vendor</th>
                  <th className="px-3 py-2 font-semibold">Urgency</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o, i) => {
                  const isOpen = expanded === o.id;
                  const status = QUALIS_STATUS[o.state];
                  return (
                    <Fragment key={o.id}>
                      <tr
                        onClick={() => setExpanded(isOpen ? null : o.id)}
                        className="cursor-pointer border-t"
                        style={{ borderColor: HCHB.powder, background: i % 2 === 0 ? "#fff" : HCHB.paper }}
                      >
                        <td className="px-3 py-2.5">
                          <div className="font-medium" style={{ color: HCHB.navy }}>
                            {o.items.map((it) => it.name).join(", ")}
                          </div>
                          <div className="font-mono text-[9.5px] text-muted">
                            {o.items.map((it) => it.hcpcs).join(" + ")}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">{o.patientLabel}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center whitespace-nowrap">
                            {vendorName(o.vendorId)}
                            <VendorBadge
                              connected={vendors.find((v) => v.id === o.vendorId)?.connected ?? true}
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          {o.urgency === "stat" ? (
                            <span style={{ color: HCHB.critical, fontWeight: 700 }}>STAT</span>
                          ) : (
                            "Routine"
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          <span
                            className="inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                            style={TONE[status.tone]}
                          >
                            {status.label}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right">
                          <div className="flex justify-end gap-1.5">
                            {o.state === "delivered" && !o.pickup && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  requestPickup(o);
                                }}
                                className="rounded px-2 py-1 text-[10px] font-semibold text-white"
                                style={{ background: HCHB.blue }}
                              >
                                Request pickup
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                flagServiceIssue(o);
                              }}
                              className="rounded border px-2 py-1 text-[10px]"
                              style={{ borderColor: HCHB.powder, color: HCHB.navy }}
                            >
                              Flag service issue
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr style={{ background: HCHB.paper }}>
                          <td colSpan={6} className="px-3 pb-3 pt-0.5">
                            <div
                              className="rounded-md border bg-white p-3 text-[11px] leading-relaxed"
                              style={{ borderColor: HCHB.powder, color: HCHB.navy }}
                            >
                              <div>Vendor: {vendorName(o.vendorId)}</div>
                              <div>Target: {new Date(o.targetAt).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}</div>
                              {o.etaAt && (
                                <div>ETA: {new Date(o.etaAt).toLocaleString([], { hour: "numeric", minute: "2-digit" })}</div>
                              )}
                              {o.pickup && (
                                <div>
                                  Pickup due: {new Date(o.pickup.dueAt).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}
                                </div>
                              )}
                              {serviceFlags[o.id] && (
                                <div className="mt-1.5" style={{ color: HCHB.critical }}>
                                  Service issue flagged: {serviceFlags[o.id]}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {orders.length === 0 && (
              <div className="py-8 text-center text-[11px] text-muted">No DME orders on file.</div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-line bg-surface p-4">
        <div className="mb-1 text-[9px] uppercase tracking-wide text-muted">
          Patient ADT feed — upstream trigger
        </div>
        <p className="mb-3 text-[11px] leading-relaxed text-ink-soft">
          A death event opens a pickup request on this patient&apos;s delivered equipment in the
          tracker above automatically. In a real HL7 feed this is the same discharge event
          (<span className="font-mono">ADT^A03</span>) as any other, carrying a death
          indicator — not a dedicated &quot;deceased&quot; message, which is why the nurse&apos;s
          &quot;Record passing&quot; tap on Equipment ▸ By patient is the primary path, and this feed
          is the redundant fallback.
        </p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {patients.map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-md border border-line px-3 py-2">
              <span className="flex-1 text-[11.5px] font-medium text-ink">{p.label}</span>
              <span className="text-[9px] uppercase tracking-wide text-muted">{p.status}</span>
              <div className="flex gap-1">
                {ADT_EVENTS.map((e) => (
                  <button
                    key={e.type}
                    disabled={p.status === e.to}
                    onClick={() => onFire(p, e.type, e.to)}
                    className={`rounded px-2 py-1 text-[10px] font-medium disabled:opacity-30 ${
                      e.type === "deceased" ? "bg-navy text-white" : "border border-line text-ink-soft"
                    }`}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-line bg-surface p-4">
        <div className="mb-2 text-[9px] uppercase tracking-wide text-muted">
          Integration log
        </div>
        <p className="mb-3 text-[10.5px] leading-relaxed text-muted">
          Every DME status change gets a timestamped entry — the same principle Qualis
          documents for its own tracker, where out-of-stock swaps, reschedules, and status
          updates are all logged with a note.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <div className="mb-1.5 text-[9px] uppercase tracking-wide text-muted">
              ADT events (patient status)
            </div>
            {log.length === 0 ? (
              <div className="text-xs text-muted">No ADT events yet.</div>
            ) : (
              <ul className="flex flex-col gap-1 font-mono text-[10.5px] text-ink-soft">
                {log.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div className="mb-1.5 text-[9px] uppercase tracking-wide text-muted">
              Order events (DME tracker)
            </div>
            {orderLog.length === 0 ? (
              <div className="text-xs text-muted">No order events yet.</div>
            ) : (
              <ul className="flex flex-col gap-1 font-mono text-[10.5px] text-ink-soft">
                {orderLog.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {flagFor && (
        <NoteModal
          title={`Service issue — ${flagFor.patientLabel} · ${flagFor.id}`}
          initialNote={serviceFlags[flagFor.id] ?? ""}
          onSave={saveServiceFlag}
          onCancel={() => setFlagFor(null)}
        />
      )}
    </div>
  );
}
