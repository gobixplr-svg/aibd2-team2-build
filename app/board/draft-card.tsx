"use client";

import { useState } from "react";
import type { InboxItem } from "./derive";

// Inline family-draft card — the same pending item the header Approvals
// tray shows, rendered in place where the case manager just clicked
// "Message family" so the draft appears where it was asked for. Approving
// here resolves the same inbox row, so the tray clears too.
export function DraftCard({
  item,
  onApprove,
  onDismiss,
}: {
  item: InboxItem;
  onApprove: (id: string, draft: string) => void;
  onDismiss: (id: string) => void;
}) {
  const [text, setText] = useState(item.draft ?? "");
  const [busy, setBusy] = useState(false);

  return (
    <div className="mt-2.5 rounded-md border border-warning/60 bg-cream p-3">
      <div className="mb-1.5 text-[9px] uppercase tracking-wide text-muted">
        Family message · Claude draft — edit, then a person sends it
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        className="w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[11px] leading-relaxed text-ink"
      />
      <div className="mt-2 flex justify-end gap-1.5">
        <button
          onClick={() => onDismiss(item.id)}
          disabled={busy}
          className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-[10px] text-ink-soft disabled:opacity-50"
        >
          Dismiss
        </button>
        <button
          onClick={() => {
            setBusy(true);
            onApprove(item.id, text.trim());
          }}
          disabled={busy || !text.trim()}
          className="rounded-md bg-teal px-3 py-1.5 text-[10px] font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Sending…" : "Approve & send"}
        </button>
      </div>
    </div>
  );
}
