"use client";

import { useState } from "react";
import type { Patient } from "@/lib/contracts";
import { emitDemoEvent } from "@/lib/demo-bus";

const INITIAL_PATIENTS: (Patient & { note: string })[] = [
  { id: "p1", label: "M. Checketts", status: "active", note: "Admitted today — discharge home 4:30 PM" },
  { id: "p3", label: "L. Sorensen", status: "active", note: "Census day 12" },
  { id: "p5", label: "J. Maughan", status: "active", note: "Admitted this morning — STAT O₂ ordered" },
  { id: "p6", label: "A. Petrov", status: "active", note: "Census day 44" },
];

const EVENTS = [
  { type: "admit", label: "Admit", to: "active" as const },
  { type: "discharge", label: "Discharge home", to: "discharged" as const },
  { type: "deceased", label: "Mark deceased", to: "deceased" as const },
];

export function EmrPanel() {
  const [patients, setPatients] = useState(INITIAL_PATIENTS);
  const [log, setLog] = useState<string[]>([]);

  function fire(patient: Patient, type: string, to: Patient["status"]) {
    setPatients((ps) => ps.map((p) => (p.id === patient.id ? { ...p, status: to } : p)));
    emitDemoEvent({
      meta: { eventType: `patientStatus.${type}`, at: new Date().toISOString() },
      account: { identifiers: [{ id: "wasatch-hospice" }] },
      payload: { patientId: patient.id, patientLabel: patient.label, status: to },
    });
    setLog((l) =>
      [
        `${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })} → patientStatus.${type} · ${patient.label}`,
        ...l,
      ].slice(0, 8),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {patients.map((p) => (
          <div key={p.id} className="rounded-lg bg-surface border border-line p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-ink">{p.label}</span>
              <span
                className={`rounded-sm px-1.5 py-0.5 text-[11px] font-semibold ${
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
            <div className="text-xs text-muted mt-0.5">{p.note}</div>
            <div className="mt-2 flex gap-1.5 flex-wrap">
              {EVENTS.map((e) => (
                <button
                  key={e.type}
                  disabled={p.status === e.to}
                  onClick={() => fire(p, e.type, e.to)}
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
        <div className="text-xs font-semibold uppercase tracking-wider text-muted">
          Event stream (eRx-shaped, ADT pattern)
        </div>
        {log.length === 0 ? (
          <div className="mt-2 text-xs text-muted">
            No events yet. Open <span className="font-mono">/board</span> in another
            tab, then mark a patient deceased — watch the pickup trigger itself.
          </div>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 font-mono text-[11px] text-ink-soft">
            {log.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
