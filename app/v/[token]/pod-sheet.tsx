"use client";

import { useState } from "react";
import type { ConditionCheck, Order } from "@/lib/contracts";

export interface PodResult {
  photoUrl?: string;
  signedBy: string;
  condition: ConditionCheck;
}

const CHECKS: { key: keyof Omit<ConditionCheck, "note">; label: string }[] = [
  { key: "clean", label: "Clean & sanitized" },
  { key: "functional", label: "Powers on / functions" },
  { key: "complete", label: "All parts present" },
];

// A blob: URL only resolves in the browser that created it — useless once
// the POD travels through the server to the board. Downscale to a small
// JPEG data URL instead so the photo renders on every surface.
async function fileToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
}

export function PodSheet({
  order,
  mode,
  onConfirm,
  onCancel,
}: {
  order: Order;
  mode: "delivery" | "pickup";
  onConfirm: (pod: PodResult) => void;
  onCancel: () => void;
}) {
  const [photoUrl, setPhotoUrl] = useState<string>();
  const [signedBy, setSignedBy] = useState("");
  const [checks, setChecks] = useState<ConditionCheck>({
    clean: false,
    functional: false,
    complete: false,
  });
  const [note, setNote] = useState("");

  const allChecked = checks.clean && checks.functional && checks.complete;
  const canConfirm = signedBy.trim().length > 1 && (allChecked || note.trim().length > 3);

  // Say WHY the confirm button is disabled — an unexplained dead button
  // reads as a bug, and the condition attestation is the compliance story.
  const stillNeeded: string[] = [];
  if (!allChecked && note.trim().length <= 3)
    stillNeeded.push("check all three condition boxes (or describe the issue)");
  if (signedBy.trim().length <= 1)
    stillNeeded.push(mode === "delivery" ? "add who received it" : "add the driver's name");

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-navy/60"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md mx-auto rounded-t-xl sm:rounded-xl bg-surface p-4 pb-8 sm:pb-4 flex flex-col gap-4 max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-base font-bold text-ink">
            {mode === "delivery" ? "Proof of delivery" : "Pickup confirmation"}
          </h2>
          <p className="text-xs text-muted">
            {order.patientLabel} · {order.items.map((i) => i.name).join(", ")}
          </p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-ink-soft">
            Photo {mode === "delivery" ? "(equipment in place)" : "(equipment retrieved)"}
          </span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              fileToDataUrl(f).then(setPhotoUrl, () => setPhotoUrl(URL.createObjectURL(f)));
            }}
            className="text-xs text-muted file:mr-2 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
          />
          {photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="proof" className="h-24 w-24 rounded-md object-cover border border-line" />
          )}
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-ink-soft">
            Equipment condition {mode === "pickup" && "(on return)"}
          </span>
          {CHECKS.map((c) => (
            <label
              key={c.key}
              className="flex items-center gap-3 rounded-md border border-line px-3 py-2.5"
            >
              <input
                type="checkbox"
                checked={checks[c.key]}
                onChange={(e) => setChecks((v) => ({ ...v, [c.key]: e.target.checked }))}
                className="h-5 w-5 accent-(--brx-teal)"
              />
              <span className="text-sm text-ink">{c.label}</span>
            </label>
          ))}
          {!allChecked && (
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Describe the issue (required if any box is unchecked)"
              rows={2}
              className="rounded-md border border-line-strong bg-cream px-3 py-2 text-sm text-ink placeholder:text-muted"
            />
          )}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-ink-soft">
            {mode === "delivery" ? "Received by (family/staff name)" : "Retrieved by (driver name)"}
          </span>
          <input
            value={signedBy}
            onChange={(e) => setSignedBy(e.target.value)}
            placeholder="Full name"
            className="rounded-md border border-line px-3 py-2.5 text-sm text-ink placeholder:text-muted"
          />
        </label>

        {stillNeeded.length > 0 && (
          <p className="text-[11px] leading-relaxed text-ink-soft">
            To confirm: {stillNeeded.join(" · ")}
          </p>
        )}
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 rounded-md border border-line px-3 py-3 text-sm font-semibold text-ink-soft"
          >
            Cancel
          </button>
          <button
            disabled={!canConfirm}
            onClick={() =>
              onConfirm({
                photoUrl,
                signedBy: signedBy.trim(),
                condition: { ...checks, note: note.trim() || undefined },
              })
            }
            className="flex-[2] rounded-md bg-teal px-3 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            {mode === "delivery" ? "Confirm delivery" : "Confirm pickup"}
          </button>
        </div>
      </div>
    </div>
  );
}
