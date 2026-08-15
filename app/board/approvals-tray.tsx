"use client";

import { useState } from "react";
import { INBOX_KIND_LABEL, type InboxItem } from "./derive";
import { Pulse } from "@/lib/pulse";

// Header tray (wireframe turn 3, 3a): approvals apply across all three
// Equipment sub-tabs, so they moved out of the Equipment rail (turn 2)
// into global chrome instead of living inside one sub-tab.
export function ApprovalsTray({
  inbox,
  onApprove,
  onDismiss,
}: {
  inbox: InboxItem[];
  onApprove: (id: string, draft?: string) => void;
  onDismiss: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftEdits, setDraftEdits] = useState<Record<string, string>>({});

  const openApprovals = inbox.filter((i) => !i.resolved);

  return (
    <div className="relative">
      <button
        data-spotlight="approvals"
        onClick={() => setOpen((v) => !v)}
        className={`relative rounded-md px-3 py-1.5 text-[11px] font-semibold ${
          openApprovals.length > 0
            ? "bg-warning/20 text-white border border-warning/60"
            : "border border-white/25 text-white/70"
        }`}
      >
        Approvals
        {openApprovals.length > 0 && (
          <span className="ml-1.5 rounded-full bg-critical px-1.5 py-0.5 text-[10px] font-bold text-white">
            {openApprovals.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[360px] max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-surface p-3.5 shadow-2xl">
            <div className="mb-2.5 text-[10px] uppercase tracking-wide text-muted">
              Approvals · {openApprovals.length}
            </div>
            {openApprovals.length === 0 ? (
              <div className="text-[11px] text-muted">
                Nothing waiting — a good night shift ends with an empty tray.
              </div>
            ) : (
              openApprovals.map((a) => (
                <Pulse key={a.id} watch={a.detail} className="border-b border-line py-2 last:border-b-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[9px] uppercase tracking-wide text-muted">
                      {INBOX_KIND_LABEL[a.kind]}
                    </span>
                    {a.context && (
                      <span className="text-[10px] font-semibold text-ink">{a.context}</span>
                    )}
                  </div>
                  <div className="my-1.5 text-[11px] leading-relaxed text-ink">{a.detail}</div>
                  {a.draft !== undefined && (
                    <div className="mb-2">
                      <div className="mb-1 text-[9px] uppercase tracking-wide text-muted">
                        Draft — edit before sending
                      </div>
                      <textarea
                        value={draftEdits[a.id] ?? a.draft}
                        onChange={(e) =>
                          setDraftEdits((d) => ({ ...d, [a.id]: e.target.value }))
                        }
                        rows={4}
                        className="w-full resize-none rounded-md border border-dashed border-line-strong bg-page px-2.5 py-2 text-[11px] leading-relaxed text-ink"
                      />
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    <button
                      onClick={() =>
                        onApprove(
                          a.id,
                          a.draft !== undefined ? (draftEdits[a.id] ?? a.draft) : undefined,
                        )
                      }
                      className="rounded-md bg-brand px-3 py-1.5 text-[10px] font-semibold text-white"
                    >
                      {a.draft !== undefined ? "Approve & send" : "Approve"}
                    </button>
                    <button
                      onClick={() => onDismiss(a.id)}
                      className="rounded-md border border-line-strong px-2.5 py-1.5 text-[10px] text-ink-soft"
                    >
                      Dismiss
                    </button>
                  </div>
                </Pulse>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
