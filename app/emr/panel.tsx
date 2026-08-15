"use client";

import { useState } from "react";
import type { Patient } from "@/lib/contracts";
import { postJson, useWorld } from "@/lib/use-world";

const EVENTS = [
  { type: "admitted", label: "Admit" },
  { type: "discharged", label: "Discharge home" },
  { type: "deceased", label: "Mark deceased" },
] as const;

const STATUS_OF: Record<string, Patient["status"]> = {
  admitted: "active",
  discharged: "discharged",
  deceased: "deceased",
};

export function EmrPanel() {
  const { state, refresh } = useWorld<{ patients: Patient[] }>();
  const [log, setLog] = useState<string[]>([]);

  const patients = state?.patients ?? [];

  async function fire(patient: Patient, type: (typeof EVENTS)[number]["type"]) {
    const ok = await postJson("/api/emr-event", { patientId: patient.id, status: type });
    setLog((l) =>
      [
        `${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })} → newOrUpdatePatient (${type}) · ${patient.label}${ok ? "" : " · FAILED"}`,
        ...l,
      ].slice(0, 8),
    );
    refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {patients.map((p) => (
          <div key={p.id} className="rounded-lg bg-surface border border-line p-3">
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold text-ink">{p.label}</span>
              <span
                className={`rounded-sm px-1.5 py-0.5 text-[13px] font-semibold ${
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
                  disabled={p.status === STATUS_OF[e.type]}
                  onClick={() => fire(p, e.type)}
                  className={`rounded-md px-2.5 py-1.5 text-sm font-semibold disabled:opacity-30 ${
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
        {patients.length === 0 && (
          <div className="text-sm text-muted py-4">Loading patients…</div>
        )}
      </div>

      <div className="rounded-lg border border-line bg-surface p-3">
        <div className="text-sm font-semibold uppercase tracking-wider text-muted">
          Event stream (eRx-shaped, ADT pattern) — now server-side: watch any device
        </div>
        {log.length === 0 ? (
          <div className="mt-2 text-sm text-muted">
            No events fired from this tab yet. Open <span className="font-mono">/board</span>{" "}
            anywhere — another laptop, a phone — then mark a patient deceased and watch the
            pickup trigger itself.
          </div>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 font-mono text-[13px] text-ink-soft">
            {log.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
