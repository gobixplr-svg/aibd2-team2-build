"use client";

import { useState } from "react";
import { INBOX_KIND_LABEL, type InboxItem } from "./derive";
import { Pulse } from "@/lib/pulse";

// Header tray (wireframe turn 3, 3a): approvals apply across all three
// Equipment sub-tabs, so they moved out of the Equipment rail (turn 2)
// into global chrome instead of living inside one sub-tab.
// The engine appends its self-assessment as the last reason, e.g.
// "Hermes triage (rank 1, confidence 0.91): Oxygen STAT order with …".
// Pull rank + confidence out so they render as a meter, not prose.
const TRIAGE_RE = /^Hermes triage \(rank (\d+), confidence ([\d.]+)\):?\s*(.*)$/;

function ReasonList({ reasons }: { reasons?: string[] }) {
  if (!reasons?.length) return null;
  const plain: string[] = [];
  let triage: { rank: number; confidence: number; summary: string } | null = null;
  for (const r of reasons) {
    const m = r.match(TRIAGE_RE);
    if (m) triage = { rank: Number(m[1]), confidence: Number(m[2]), summary: m[3] };
    else plain.push(r);
  }
  return (
    <div className="mb-2 flex flex-col gap-1">
      {plain.map((r) => (
        <div
          key={r}
          className="flex gap-1.5 rounded-md border border-line bg-page px-2 py-1.5 text-[12px] leading-snug text-ink-soft"
        >
          <span className="font-bold text-warning">·</span>
          <span>{r}</span>
        </div>
      ))}
      {triage && (
        <div className="mt-0.5 rounded-md border border-line bg-page px-2 py-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] uppercase tracking-wide text-muted">
              Hermes triage · rank {triage.rank}
            </span>
            <span className="text-[12px] font-semibold tabular-nums text-ink">
              {Math.round(triage.confidence * 100)}% confidence
            </span>
          </div>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-teal"
              style={{ width: `${Math.round(triage.confidence * 100)}%` }}
            />
          </div>
          {triage.summary && (
            <div className="mt-1 text-[12px] leading-snug text-muted">{triage.summary}</div>
          )}
        </div>
      )}
    </div>
  );
}

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
        className={`relative rounded-md px-3 py-1.5 text-[13px] font-semibold ${
          openApprovals.length > 0
            ? "bg-warning/20 text-white border border-warning/60"
            : "border border-white/25 text-white/70"
        }`}
      >
        Approvals
        {openApprovals.length > 0 && (
          <span className="ml-1.5 rounded-full bg-critical px-1.5 py-0.5 text-[12px] font-bold text-white">
            {openApprovals.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[360px] max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-surface p-3.5 shadow-2xl">
            <div className="mb-2.5 text-[12px] uppercase tracking-wide text-muted">
              Approvals · {openApprovals.length}
            </div>
            {openApprovals.length === 0 ? (
              <div className="text-[13px] text-muted">
                Nothing waiting — a good night shift ends with an empty tray.
              </div>
            ) : (
              openApprovals.map((a) => (
                <Pulse key={a.id} watch={a.detail} className="border-b border-line py-2 last:border-b-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[11px] uppercase tracking-wide text-muted">
                      {INBOX_KIND_LABEL[a.kind]}
                    </span>
                    {a.context && (
                      <span className="text-[12px] font-semibold text-ink">{a.context}</span>
                    )}
                  </div>
                  <div className="my-1.5 text-[13px] font-medium leading-relaxed text-ink">
                    {a.detail}
                  </div>
                  <ReasonList reasons={a.reasons} />
                  {a.draft !== undefined && (
                    <div className="mb-2">
                      <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">
                        Draft — edit before sending
                      </div>
                      <textarea
                        value={draftEdits[a.id] ?? a.draft}
                        onChange={(e) =>
                          setDraftEdits((d) => ({ ...d, [a.id]: e.target.value }))
                        }
                        rows={4}
                        className="w-full resize-none rounded-md border border-dashed border-line-strong bg-page px-2.5 py-2 text-[13px] leading-relaxed text-ink"
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
                      className="rounded-md bg-brand px-3 py-1.5 text-[12px] font-semibold text-white"
                    >
                      {a.draft !== undefined ? "Approve & send" : "Approve"}
                    </button>
                    <button
                      onClick={() => onDismiss(a.id)}
                      className="rounded-md border border-line-strong px-2.5 py-1.5 text-[12px] text-ink-soft"
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
