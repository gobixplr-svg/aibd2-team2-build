"use client";

import { useState } from "react";
import type { Patient } from "@/lib/contracts";

// Patterned after Homecare Homebase (HCHB) — 38.7% of hospice providers
// and 4 of the top 5 largest hospice organizations run on it, ahead of
// MatrixCare and WellSky (2024 industry data). The real product's own
// manual documents a dense, console-based Windows-Forms interface (an
// "Action Screen" of boxy sub-tabs, sortable data grids with a
// task-aging color ramp of white → yellow → orange → red, and modal
// dialogs with navy title bars) — reviewers consistently describe the
// look as dated ("feels like a program from the late 90s"). This tab
// borrows that visual language deliberately: it's the old system
// BetterRX's coordination layer sits on top of, not a reskin of it.
// Synthetic simulation only — not affiliated with or endorsed by HCHB.

export interface EmrLogEntry {
  time: string;
  adt: string;
  detail: string;
  patientLabel: string;
}

const EVENTS = [
  {
    type: "admit",
    label: "Admit",
    to: "active" as const,
    adt: "ADT^A01",
    segments: "new admission",
  },
  {
    type: "discharge",
    label: "Discharge",
    to: "discharged" as const,
    adt: "ADT^A03",
    segments: "PID-30 (death ind): N",
  },
  {
    type: "deceased",
    label: "Deceased",
    to: "deceased" as const,
    adt: "ADT^A03",
    segments: "PID-30 (death ind): Y · PV1-36: 20 (Expired)",
  },
];

type EventDef = (typeof EVENTS)[number];

// Synthetic MR number, HCHB-style alphanumeric — derived from the
// patient id only for display, not a real identifier scheme.
function mrn(patientId: string): string {
  const digits = patientId.replace(/\D/g, "").padStart(6, "0");
  return `MR${digits}9901`;
}

const STATUS_LABEL: Record<Patient["status"], string> = {
  active: "ACTIVE",
  discharged: "DISCHARGED",
  deceased: "DECEASED",
};

export function EmrTab({
  patients,
  log,
  onFire,
}: {
  patients: Patient[];
  log: EmrLogEntry[];
  onFire: (patient: Patient, type: string, to: Patient["status"]) => void;
}) {
  const [subTab, setSubTab] = useState<"roster" | "events">("roster");
  const [confirmFor, setConfirmFor] = useState<{ patient: Patient; event: EventDef } | null>(
    null,
  );

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2.5 border-b border-line-strong bg-[linear-gradient(#eef1f5,#dbe1e8)] px-4 py-2">
        <span className="text-[13px] font-bold tracking-tight text-navy">
          homecare<span className="mx-0.5 text-brand">◆</span>homebase
        </span>
        <span className="text-[10px] text-ink-soft">Clinical Manager — Hospice (pattern)</span>
        <span className="ml-auto rounded-sm border border-line-strong bg-surface px-2 py-0.5 text-[9px] uppercase tracking-wide text-ink-soft">
          synthetic simulation
        </span>
      </div>

      <div className="flex flex-col gap-3 p-5">
        <p className="max-w-2xl text-xs leading-relaxed text-muted">
          Patterned after Homecare Homebase (HCHB) — 38.7% of hospice providers and 4 of the
          top 5 largest hospice organizations run on it, ahead of MatrixCare and WellSky
          (2024 industry data). Not affiliated with or endorsed by HCHB.
        </p>
        <p className="max-w-2xl text-xs leading-relaxed text-muted">
          A death is an <span className="font-mono">ADT^A03</span> discharge event with a
          death indicator — not a dedicated &quot;deceased&quot; message. That&apos;s the
          real-world reason the nurse&apos;s &quot;Record passing&quot; tap on the Patients
          tab is the primary path: a live integration has no distinct event to listen for.
          This feed is the redundant fallback, and its{" "}
          <span className="font-mono">triggeredBy</span> keeps the two paths visibly
          distinct.
        </p>

        <div className="flex gap-0.5 border-b border-line-strong">
          {(
            [
              { key: "roster", label: "Client Related Tasks" },
              { key: "events", label: "Event/Stages History" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setSubTab(t.key)}
              className={`-mb-px rounded-t-sm border border-b-0 px-3 py-1.5 text-[11px] ${
                subTab === t.key
                  ? "border-line-strong bg-surface font-semibold text-ink"
                  : "border-transparent bg-page text-ink-soft"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {subTab === "roster" ? (
          <div className="border border-line-strong">
            <div className="border-b border-line-strong bg-line px-2.5 py-1 text-[9px] text-ink-soft">
              Drag a column header here to group by that column
            </div>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-[#cfe0c8] text-left text-[9px] uppercase tracking-wide text-ink">
                  <th className="px-2.5 py-1.5 font-semibold">MR Number</th>
                  <th className="px-2.5 py-1.5 font-semibold">Client Name</th>
                  <th className="px-2.5 py-1.5 font-semibold">Status</th>
                  <th className="px-2.5 py-1.5 font-semibold">Payor Type</th>
                  <th className="px-2.5 py-1.5 text-right font-semibold">ADT Event</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p, i) => (
                  <tr
                    key={p.id}
                    className={`border-t border-line ${i % 2 === 0 ? "bg-surface" : "bg-page"}`}
                  >
                    <td className="px-2.5 py-2 font-mono text-[9.5px] text-ink-soft">
                      {mrn(p.id)}
                    </td>
                    <td className="px-2.5 py-2 font-semibold text-ink">{p.label}</td>
                    <td className="px-2.5 py-2">
                      <span
                        className={`rounded-sm px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                          p.status === "active"
                            ? "bg-teal text-navy"
                            : p.status === "deceased"
                              ? "bg-navy text-white"
                              : "bg-line text-ink-soft"
                        }`}
                      >
                        {STATUS_LABEL[p.status]}
                      </span>
                    </td>
                    <td className="px-2.5 py-2 text-ink-soft">MEDICARE</td>
                    <td className="px-2.5 py-2">
                      <div className="flex justify-end gap-1">
                        {EVENTS.map((e) => (
                          <button
                            key={e.type}
                            disabled={p.status === e.to}
                            onClick={() => setConfirmFor({ patient: p, event: e })}
                            title={`${e.adt} — ${e.segments}`}
                            className="rounded-sm border border-line-strong bg-surface px-1.5 py-1 text-[10px] text-ink-soft disabled:opacity-30"
                          >
                            {e.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="border border-line-strong bg-surface p-4">
            <div className="mb-2.5 flex items-baseline justify-between border-b border-line-strong pb-2">
              <div className="text-sm font-semibold text-navy">Event/Stages History Report</div>
              <div className="text-[10px] text-muted">By Event</div>
            </div>
            {log.length === 0 ? (
              <div className="py-4 text-xs text-muted">
                No events yet. Fire one from Client Related Tasks — the Patients and
                Equipment tabs update immediately.
              </div>
            ) : (
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-line-strong text-left text-[9px] uppercase tracking-wide text-muted">
                    <th className="py-1 pr-3 font-semibold">Time</th>
                    <th className="py-1 pr-3 font-semibold">Event</th>
                    <th className="py-1 pr-3 font-semibold">Detail</th>
                    <th className="py-1 font-semibold">Client</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-[10.5px] text-ink-soft">
                  {log.map((e, i) => (
                    <tr key={i} className="border-b border-line">
                      <td className="py-1.5 pr-3">{e.time}</td>
                      <td className="py-1.5 pr-3 text-navy">{e.adt}</td>
                      <td className="py-1.5 pr-3">{e.detail}</td>
                      <td className="py-1.5 text-ink">{e.patientLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="mt-3 border-t border-line-strong pt-2 text-center text-[9px] text-muted">
              Synthetic feed patterned after Homecare Homebase — not affiliated with HCHB ·
              Page 1 of 1
            </div>
          </div>
        )}
      </div>

      {confirmFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy/45 p-4"
          onClick={() => setConfirmFor(null)}
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-sm border border-line-strong shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-navy px-3 py-2 text-[12px] font-semibold text-white">
              {confirmFor.event.label} for {confirmFor.patient.label}
            </div>
            <div className="bg-surface p-4 text-[11px] leading-loose text-ink">
              <div className="flex">
                <span className="min-w-[110px] text-ink-soft">Client Name</span>
                <span className="font-medium">{confirmFor.patient.label}</span>
              </div>
              <div className="flex">
                <span className="min-w-[110px] text-ink-soft">MR Number</span>
                <span className="font-mono">{mrn(confirmFor.patient.id)}</span>
              </div>
              <div className="flex">
                <span className="min-w-[110px] text-ink-soft">Trigger Event</span>
                <span className="font-mono">{confirmFor.event.adt}</span>
              </div>
              <div className="flex">
                <span className="min-w-[110px] text-ink-soft">Segments</span>
                <span>{confirmFor.event.segments}</span>
              </div>
              <div className="mt-3.5 flex justify-end gap-2 border-t border-line-strong pt-3">
                <button
                  onClick={() => setConfirmFor(null)}
                  className="rounded-sm border border-line-strong bg-page px-3 py-1.5 text-[11px] text-ink-soft"
                >
                  ✗ Cancel
                </button>
                <button
                  onClick={() => {
                    onFire(confirmFor.patient, confirmFor.event.type, confirmFor.event.to);
                    setConfirmFor(null);
                  }}
                  className="rounded-sm bg-brand px-3 py-1.5 text-[11px] font-semibold text-white"
                >
                  ✓ OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
