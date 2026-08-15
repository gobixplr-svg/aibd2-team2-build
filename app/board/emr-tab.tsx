"use client";

import type { Patient } from "@/lib/contracts";

// Real HL7 ADT mechanics: admission is ADT^A01. Discharge AND death are
// the SAME trigger event, ADT^A03 — death is a discharge carrying a
// Patient Death Indicator (PID-30: Y) and Discharge Disposition 20
// (Expired) in PV1-36, not a distinct event type. That's exactly why the
// nurse's "Record passing" tap is the primary path rather than something
// that waits on this feed: a real integration doesn't get a dedicated
// "deceased" event to listen for.
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
    label: "Discharge home",
    to: "discharged" as const,
    adt: "ADT^A03",
    segments: "PID-30 (death ind): N",
  },
  {
    type: "deceased",
    label: "Mark deceased",
    to: "deceased" as const,
    adt: "ADT^A03",
    segments: "PID-30 (death ind): Y · PV1-36: 20 (Expired)",
  },
];

// EMR simulator — folded into a tab (turn 2) instead of its own route,
// so the event and the effect it has on the census land on one screen.
// Patterned after Homecare Homebase (HCHB): 38.7% of hospice providers
// and 4 of the top 5 largest hospice organizations run on it (2024
// industry data) — the dominant system by a wide margin over MatrixCare
// and WellSky, which is why this simulator's event shape follows HCHB's
// ADT pattern rather than a generic one. Synthetic feed only — this
// doesn't connect to or impersonate the real HCHB product.
export function EmrTab({
  patients,
  log,
  onFire,
}: {
  patients: Patient[];
  log: string[];
  onFire: (patient: Patient, type: string, to: Patient["status"]) => void;
}) {
  return (
    <div className="p-5 flex flex-col gap-4">
      <div>
        <div className="flex items-baseline gap-2">
          <div className="text-sm font-semibold text-ink">EMR simulator</div>
          <span className="rounded-full bg-cream px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink">
            Homecare Homebase pattern
          </span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted max-w-2xl">
          Stands in for the hospice EMR&apos;s ADT feed, shaped after Homecare
          Homebase (HCHB) — 38.7% of hospice providers and 4 of the top 5 largest
          hospice organizations run on it, ahead of MatrixCare and WellSky.
          Synthetic events only; not connected to or affiliated with the real
          HCHB product.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted max-w-2xl">
          A death is an <span className="font-mono">ADT^A03</span> discharge
          event with a death indicator — the same trigger type as a routine
          discharge, not a dedicated &quot;deceased&quot; message. That&apos;s the
          real-world reason the nurse&apos;s &quot;Record passing&quot; tap on the
          Patients tab is the primary path: a live integration has no distinct
          event to listen for. This feed is the redundant fallback, and its{" "}
          <span className="font-mono">triggeredBy</span> keeps the two paths
          visibly distinct.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {patients.map((p) => (
          <div key={p.id} className="rounded-lg border border-line bg-surface p-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-ink">{p.label}</span>
              <span
                className={`ml-auto rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  p.status === "active"
                    ? "bg-teal text-navy"
                    : p.status === "deceased"
                      ? "bg-navy text-white"
                      : "bg-line text-ink-soft"
                }`}
              >
                {p.status}
              </span>
            </div>
            <div className="mt-2 flex gap-1.5 flex-wrap">
              {EVENTS.map((e) => (
                <button
                  key={e.type}
                  disabled={p.status === e.to}
                  onClick={() => onFire(p, e.type, e.to)}
                  title={`${e.adt} — ${e.segments}`}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-semibold disabled:opacity-30 ${
                    e.type === "deceased"
                      ? "bg-navy text-white"
                      : "border border-line text-ink-soft"
                  }`}
                >
                  {e.label}
                  <span className="ml-1.5 font-mono text-[9px] font-normal opacity-70">
                    {e.adt}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-line bg-surface p-3">
        <div className="text-[9px] uppercase tracking-wide text-muted mb-2">
          Event stream · HL7 ADT, HCHB pattern
        </div>
        {log.length === 0 ? (
          <div className="text-xs text-muted">
            No events yet. Fire one above — the Patients and Equipment tabs
            update immediately.
          </div>
        ) : (
          <ul className="flex flex-col gap-1 font-mono text-[11px] text-ink-soft">
            {log.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
