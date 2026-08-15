"use client";

import Link from "next/link";
import type { Patient } from "@/lib/contracts";

const STATUS_LABEL: Record<Patient["status"], string> = {
  active: "Active",
  discharged: "Discharged",
  deceased: "Deceased",
};

// Wireframe turn 3, 3a adds "Family view" to the top chrome but has no
// dedicated mock for it — the family tracker itself (/f/[token]) was
// already built and stays read-only, patient-facing. This is the
// nurse-facing index of who has a live tracker link, so it's reachable
// without knowing a token by heart.
export function FamilyViewTab({ patients }: { patients: Patient[] }) {
  return (
    <div className="p-5">
      <div className="mb-3.5 text-[21px] font-semibold text-ink">Family view</div>
      <p className="mb-4 max-w-xl text-sm leading-relaxed text-muted">
        Each patient with an active family-tracker link, below. The tracker itself is
        read-only and calm by design — this index is for the care team, not the family.
      </p>
      <div className="flex flex-col gap-2">
        {patients.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3"
          >
            <div className="flex-1">
              <div className="text-base font-medium text-ink">{p.label}</div>
              <div className="text-[12px] text-muted">
                {p.id} · {STATUS_LABEL[p.status]}
              </div>
            </div>
            {p.familyToken ? (
              <Link
                href={`/f/${p.familyToken}`}
                target="_blank"
                className="rounded-md border border-line-strong bg-page px-3 py-2 text-[13px] text-ink-soft"
              >
                Open tracker
              </Link>
            ) : (
              <span className="text-[12px] text-muted">no tracker link yet</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
