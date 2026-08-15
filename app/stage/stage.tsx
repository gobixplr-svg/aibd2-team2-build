"use client";

// The demo stage — the whole two-sided story in ONE browser tab.
//
// Three live surfaces (hospice board, vendor phone, family tracker) are
// the real pages in same-origin iframes, all polling the same server
// world, so an action in any panel shows up in the others within ~2s.
// The director bar along the bottom replaces /control during the pitch:
// one cue per beat, and the two time-jump beats fire the same guarded
// endpoints /control uses (secret typed once, kept in sessionStorage
// under the same key, so unlocking either page unlocks both).
//
// The presenter's motion for the entire demo: read the cue, click Next,
// occasionally click inside a panel. The physical phone still gets its
// one moment at beat 3 — hold it up, then run everything from here.

import { useCallback, useEffect, useRef, useState } from "react";

const REFERRAL = `REFERRAL — Mountain View Regional Medical Center · Discharge Planning
Pt: Sorensen, L. — hospice, discharging home to spouse's care

DME needed IN HOME BEFORE discharge, no later than 10:00 AM tomorrow.
Per Dr. Patel:
  - Semi-electric hospital bed w/ rails, adjustable head
  - Oxygen concentrator, 2L continuous; portable O2 for transport home
  - Shower bench for bathroom safety per PT eval

Stairs at front entry — delivery crew should call ahead.`;

interface Beat {
  title: string;
  cue: string;
  say?: string;
  action?: { label: string; confirm?: string; run: "reset" | "speed-tick" | "jump-tick" };
  copyReferral?: boolean;
  // data-spotlight target on the board — rings the control this beat is
  // about (lib/spotlight.ts listens in the board iframe).
  spotlight?: string;
  // fetch cost.byKind and put the per-kind lines in the note bar, so the
  // presenter quotes real numbers instead of remembering them.
  showLedger?: boolean;
}

const BEATS: Beat[] = [
  {
    title: "Rig check",
    cue: "Reset the world, confirm the census seeds. Always pick Wasatch in the intake beat so the vendor panel matches.",
    action: { label: "Reset world", confirm: "Reset the shared prod world?", run: "reset" },
  },
  {
    title: "Cold open — one screen",
    cue: "Board panel → Equipment ▸ By patient. Census grouped by assets, spend and risk per patient.",
    say: "Everything for every patient, finally on one screen — the single pane of glass your VP asked for.",
    spotlight: "subtab-by-patient",
  },
  {
    title: "AI intake",
    cue: "Board → New order → paste the referral (button here) → Extract. Point at confidence chips + the 'Didn't map: shower bench' callout. Confirm patient, pick Wasatch, Place order.",
    say: "When the AI isn't sure it says so per field — and what it can't map it hands back instead of guessing. A human confirms every field. About half a cent per extraction.",
    copyReferral: true,
    spotlight: "new-order",
  },
  {
    title: "Vendor, zero login",
    cue: "Vendor panel (or hold up the phone): Accept order → in transit.",
    say: "Magic link, no account, no install. Both sides are the same server world — one database, no smoke.",
  },
  {
    title: "Risk fires before it's late",
    cue: "Fire the button, then point at the flagged order on the board: computed numbers + the ranked why with its confidence.",
    say: "The model receives computed features and returns a choice from a fixed list. It cannot invent a delivery status — that failure mode is closed off architecturally.",
    action: { label: "Speed 60× + Tick now", run: "speed-tick" },
  },
  {
    title: "Delivered, family sees it",
    cue: "Vendor panel: Delivered → POD condition checklist. Family panel updates on its own.",
    say: "Proof of delivery with condition capture — and the family already knows the bed is set up.",
  },
  {
    title: "The hard part of hospice",
    cue: "Board ▸ By patient → expand → Record passing (own confirm). Vendor panel: Acknowledge pickup → commit a retrieval window. Family panel shows the window.",
    say: "Closed loop: acknowledged, scheduled, completed — with a 24-hour SLA clock. Nobody in this market closes this loop.",
    spotlight: "subtab-by-patient",
  },
  {
    title: "Escalation, human approval",
    cue: "Fire the button. Approvals tray (board header): edit ONE word of the Claude family draft → Approve & send. If a reroute is waiting, approve it and glance at the vendor panel.",
    say: "Anything a family reads is drafted by AI and sent by a person. Never Hermes alone.",
    action: { label: "+25h + Tick now", run: "jump-tick" },
    spotlight: "approvals",
  },
  {
    title: "Close on the ledger",
    cue: "The live per-kind lines appear below (never quote the blended per-touch number).",
    say: "Every model call tonight is metered — roughly a cent per at-risk order triaged, half a cent per intake. Measured, not estimated. The engine costs nothing when nothing is wrong.",
    spotlight: "subtab-analytics",
    showLedger: true,
  },
];

interface TickInfo {
  aiUsed: boolean;
  costUsd: number;
  inboxCreated: number;
  fallbackReason?: string;
}

export function StagePage() {
  const [key, setKey] = useState("");
  const [keyLoaded, setKeyLoaded] = useState(false);
  const [beat, setBeat] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const boardFrame = useRef<HTMLIFrameElement>(null);

  // On beat change: ring the control this beat is about on the board, and
  // for the ledger close pull the real per-kind numbers into the note bar.
  useEffect(() => {
    const b = BEATS[beat];
    if (b.spotlight) {
      boardFrame.current?.contentWindow?.postMessage(
        { type: "hf-spotlight", target: b.spotlight },
        window.location.origin,
      );
    }
    if (b.showLedger) {
      fetch("/api/state?scope=hospice")
        .then((r) => r.json())
        .then((s) => {
          const byKind = s?.cost?.byKind as
            | Record<string, { units: number; usd: number; perUnitUsd: number }>
            | undefined;
          if (!byKind || Object.keys(byKind).length === 0) return;
          const lines = Object.entries(byKind)
            .map(
              ([k, v]) =>
                `${k.replace(/_/g, " ")} $${v.perUnitUsd.toFixed(4)}/unit (${v.units} × → $${v.usd.toFixed(2)})`,
            )
            .join("  ·  ");
          setNote(`Ledger, live: ${lines}`);
        })
        .catch(() => {});
    }
  }, [beat]);

  useEffect(() => {
    // Deferred — same never-a-sync-setState convention as use-world.ts.
    const id = setTimeout(() => {
      setKey(sessionStorage.getItem("hermes-key") ?? "");
      setKeyLoaded(true);
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const saveKey = (k: string) => {
    setKey(k);
    sessionStorage.setItem("hermes-key", k);
  };

  const call = useCallback(
    async (url: string, body?: unknown) => {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(key ? { "x-hermes-secret": key } : {}),
        },
        body: body === undefined ? "{}" : JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.ok) {
        throw new Error(res.status === 403 ? "forbidden — check the key" : (json.error ?? "failed"));
      }
      return json;
    },
    [key],
  );

  const fire = useCallback(
    async (action: NonNullable<Beat["action"]>) => {
      if (action.confirm && !window.confirm(action.confirm)) return;
      setBusy(true);
      setError(null);
      setNote(null);
      try {
        if (action.run === "reset") {
          await call("/api/reset");
          setNote("World reset — seeded fresh.");
        } else {
          if (action.run === "speed-tick") await call("/api/clock", { speed: 60 });
          else await call("/api/clock", { jumpHours: 25 });
          const tick = (await call("/api/tick")) as TickInfo;
          setNote(
            `Tick: ${tick.inboxCreated} inbox row(s) · ${
              tick.aiUsed ? `AI, $${tick.costUsd.toFixed(4)}` : `no call (${tick.fallbackReason ?? "n/a"})`
            }`,
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [call],
  );

  const copyReferral = async () => {
    try {
      await navigator.clipboard.writeText(REFERRAL);
      setNote("Referral copied — paste it into New order.");
    } catch {
      setError("Clipboard blocked — copy from docs/prod-click-through.md instead.");
    }
  };

  const b = BEATS[beat];

  return (
    <div className="flex h-dvh flex-col bg-page">
      <div className="flex min-h-0 flex-1 gap-2 p-2">
        <div className="flex min-w-0 flex-[3] flex-col overflow-hidden rounded-lg border-2 border-navy bg-surface">
          <PanelLabel
            icon="🏥"
            who="HOSPICE"
            detail="case manager's board · laptop"
            accent="bg-navy"
          />
          <iframe
            ref={boardFrame}
            src="/board"
            title="Hospice board"
            className="h-full w-full flex-1 border-0"
          />
        </div>
        <div className="flex w-[340px] shrink-0 flex-col gap-2 md:w-[380px]">
          <div className="flex min-h-0 flex-[3] flex-col overflow-hidden rounded-lg border-2 border-teal bg-surface">
            <PanelLabel
              icon="🚚"
              who="DME VENDOR"
              detail="dispatcher's phone · magic link, no login"
              accent="bg-teal"
            />
            <iframe src="/v/demo-vendor" title="Vendor dispatch" className="h-full w-full flex-1 border-0" />
          </div>
          <div className="flex min-h-0 flex-[2] flex-col overflow-hidden rounded-lg border-2 border-brand bg-surface">
            <PanelLabel
              icon="👪"
              who="FAMILY"
              detail="read-only link, texted to them"
              accent="bg-brand"
            />
            <iframe src="/f/demo-family" title="Family tracker" className="h-full w-full flex-1 border-0" />
          </div>
        </div>
      </div>

      <div className="border-t border-line-strong bg-navy px-3 py-2.5 text-white">
        {!keyLoaded ? null : !key ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/80">Director bar is locked — paste the Hermes secret:</span>
            <input
              type="password"
              autoComplete="off"
              className="w-56 rounded-sm border border-white/25 bg-white/10 px-2 py-1 text-xs text-white outline-none placeholder:text-white/40"
              placeholder="hermes secret"
              onKeyDown={(e) => {
                if (e.key === "Enter") saveKey((e.target as HTMLInputElement).value.trim());
              }}
            />
            <span className="text-[10px] text-white/50">Enter to save (sessionStorage, shared with /control)</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3">
              <span className="shrink-0 rounded-sm bg-brand px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                Beat {beat + 1}/{BEATS.length}
              </span>
              <span className="shrink-0 text-sm font-semibold">{b.title}</span>
              <span className="ml-auto flex shrink-0 items-center gap-1.5">
                {b.copyReferral && (
                  <button
                    onClick={copyReferral}
                    className="rounded-md border border-white/25 px-2.5 py-1.5 text-xs font-semibold hover:bg-white/10"
                  >
                    Copy referral
                  </button>
                )}
                {b.action && (
                  <button
                    onClick={() => fire(b.action!)}
                    disabled={busy}
                    className="rounded-md bg-brand px-2.5 py-1.5 text-xs font-bold hover:bg-brand-alt disabled:opacity-50"
                  >
                    {busy ? "…" : b.action.label}
                  </button>
                )}
                <button
                  onClick={() => setBeat((x) => Math.max(0, x - 1))}
                  disabled={beat === 0}
                  className="rounded-md border border-white/25 px-2.5 py-1.5 text-xs font-semibold hover:bg-white/10 disabled:opacity-30"
                >
                  ◀ Prev
                </button>
                <button
                  onClick={() => setBeat((x) => Math.min(BEATS.length - 1, x + 1))}
                  disabled={beat === BEATS.length - 1}
                  className="rounded-md bg-teal px-3.5 py-1.5 text-xs font-bold text-navy hover:opacity-90 disabled:opacity-30"
                >
                  Next ▶
                </button>
              </span>
            </div>
            <div className="flex items-baseline gap-3 text-xs leading-snug">
              <span className="text-white/90">{b.cue}</span>
            </div>
            {b.say && (
              <div className="text-xs italic leading-snug text-teal">&ldquo;{b.say}&rdquo;</div>
            )}
            {(note ?? error) && (
              <div className={`text-[11px] ${error ? "text-brand-alt" : "text-white/60"}`}>
                {error ?? note}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PanelLabel({
  icon,
  who,
  detail,
  accent,
}: {
  icon: string;
  who: string;
  detail: string;
  accent: string;
}) {
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 text-white ${accent}`}>
      <span className="text-sm leading-none">{icon}</span>
      <span className="text-xs font-bold tracking-wider">{who}</span>
      <span className="text-[11px] text-white/75">{detail}</span>
      <span className="ml-auto rounded-sm bg-white/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white/80">
        separate window · same live system
      </span>
    </div>
  );
}
