"use client";

import { useState } from "react";
import type { Order, Patient } from "@/lib/contracts";

// Guarded confirm from the patient row (wireframe 1e). This is the
// nurse-initiated primary path — the EMR "Mark deceased" event is the
// redundant fallback (lib/contracts.ts Pickup.triggeredBy), and the two
// must never look alike on screen.
export function DeceasedConfirm({
  patient,
  orders,
  onConfirm,
  onCancel,
}: {
  patient: Patient;
  orders: Order[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const assets = orders.filter((o) => o.state === "delivered").flatMap((o) => o.items);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/45 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[17px] font-semibold text-ink mb-2">
          Start equipment pickup now?
        </div>
        <p className="mb-3.5 text-sm leading-relaxed text-ink-soft">
          This records the passing and dispatches pickup for{" "}
          {assets.length === 1 ? "the asset" : `all ${assets.length} assets`} immediately. It
          can&apos;t be undone.
        </p>

        <div className="mb-3.5 rounded-md bg-page p-3 text-[13px] leading-relaxed text-ink">
          {assets.length === 0 ? (
            <div className="text-muted">No delivered equipment on file for {patient.label}.</div>
          ) : (
            assets.map((it, i) => (
              <div key={`${it.hcpcs}-${i}`}>
                {it.name} · {it.hcpcs}
                {it.assetId ? ` · ${it.assetId}` : ""}
              </div>
            ))
          )}
          <div className="mt-2 text-[12px] text-muted">
            Pickup due within 24 hours of trigger — the hospice pays until retrieval.
          </div>
        </div>

        <label className="mb-3.5 flex items-center gap-2 text-[13px] text-ink">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="h-4 w-4 rounded-sm border-line-strong"
          />
          I&apos;m confirming this as <span className="font-semibold">M. Ruiz, RN</span> — case
          manager
        </label>

        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            disabled={!confirmed}
            className="flex-1 rounded-md bg-brand px-3 py-2.5 text-center text-sm font-semibold text-white disabled:opacity-40"
          >
            Trigger pickup
          </button>
          <button
            onClick={onCancel}
            className="rounded-md border border-line-strong bg-surface px-4 py-2.5 text-sm text-ink-soft"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
