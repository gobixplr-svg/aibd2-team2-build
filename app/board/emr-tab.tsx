"use client";

import type { Patient } from "@/lib/contracts";

const EVENTS = [
  { type: "admit", label: "Admit", to: "active" as const },
  { type: "discharge", label: "Discharge home", to: "discharged" as const },
  { type: "deceased", label: "Mark deceased", to: "deceased" as const },
];

// EMR simulator — folded into a tab (turn 2) instead of its own route,
// so the event and the effect it has on the census land on one screen.
// Same eRx-shaped event pattern as the original /emr panel.
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
        <div className="text-sm font-semibold text-ink">
          EMR simulator — HCHB/MatrixCare/Netsmart pattern
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted max-w-2xl">
          Stands in for the hospice EMR&apos;s event feed. A deceased event starts
          the pickup workflow on its own — the redundant path behind the
          nurse&apos;s &quot;Record passing&quot; tap on the Patients tab. The
          stream&apos;s <span className="font-mono">triggeredBy</span> keeps the
          two paths visibly distinct.
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
                    ? "bg-teal/15 text-teal"
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
                  className={`rounded-md px-2.5 py-1.5 text-xs font-semibold disabled:opacity-30 ${
                    e.type === "deceased"
                      ? "bg-navy text-white"
                      : "border border-line text-ink-soft"
                  }`}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-line bg-surface p-3">
        <div className="text-[9px] uppercase tracking-wide text-muted mb-2">
          Event stream · eRx-shaped, ADT pattern
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
