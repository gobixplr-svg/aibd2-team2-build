"use client";

// The demo stage — the whole two-sided story in ONE browser tab.
//
// Three live surfaces (hospice board, vendor phone, family tracker) are
// the real pages in same-origin iframes, all polling the same server
// world, so an action in any panel shows up in the others within ~2s.
//
// The bottom strip is a permanent control bar, not a script: rehearsal
// showed the presenter drives the demo by clicking through the app
// itself, so the beat system (cues, Next, auto-advance) came out and
// only the controls stayed — reset, referral, the three tick moves, and
// the live per-kind ledger readout. The spoken beats live in
// docs/game-day-runbook.md; this bar just gives the presenter's hands
// what they need without leaving the tab. Buttons fire the same guarded
// endpoints /control uses (secret typed once, kept in sessionStorage
// under the same key, so unlocking either page unlocks both).

import { useCallback, useEffect, useState } from "react";

const REFERRAL = `REFERRAL — Mountain View Regional Medical Center · Discharge Planning
Pt: Sorensen, L. — hospice, discharging home to spouse's care

DME needed IN HOME BEFORE discharge, no later than 10:00 AM tomorrow.
Per Dr. Patel:
  - Semi-electric hospital bed w/ rails, adjustable head
  - Oxygen concentrator, 2L continuous; portable O2 for transport home
  - Shower bench for bathroom safety per PT eval

Stairs at front entry — delivery crew should call ahead.`;

interface TickInfo {
  aiUsed: boolean;
  costUsd: number;
  inboxCreated: number;
  fallbackReason?: string;
}

export function StagePage() {
  const [key, setKey] = useState("");
  const [keyLoaded, setKeyLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sim, setSim] = useState<{ now: string; speed: number } | null>(null);

  useEffect(() => {
    // Deferred — same never-a-sync-setState convention as use-world.ts.
    const id = setTimeout(() => {
      setKey(sessionStorage.getItem("hermes-key") ?? "");
      setKeyLoaded(true);
    }, 0);
    return () => clearTimeout(id);
  }, []);

  // The simulated world clock, front and center: every deadline in the
  // panels is measured against THIS time, so the presenter (and judges)
  // can watch a 4:30 deadline actually pass when time jumps.
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/state?scope=hospice");
        const s = await res.json();
        if (!cancelled && s?.now) setSim({ now: s.now, speed: s.clock?.speed ?? 1 });
      } catch {
        // best-effort — the clock chip just goes quiet
      }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
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

  const run = useCallback(
    async (label: string, fn: () => Promise<string>) => {
      setBusy(true);
      setError(null);
      setNote(null);
      try {
        setNote(await fn());
      } catch (err) {
        setError(`${label}: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const tickNote = (tick: TickInfo) =>
    `Tick: ${tick.inboxCreated} inbox row(s) · ${
      tick.aiUsed ? `AI, $${tick.costUsd.toFixed(4)}` : `no call (${tick.fallbackReason ?? "n/a"})`
    }`;

  const resetWorld = () => {
    if (!window.confirm("Reset the shared prod world?")) return;
    run("Reset", async () => {
      await call("/api/reset");
      return "World reset — seeded fresh.";
    });
  };

  const tickNow = () =>
    run("Tick", async () => tickNote((await call("/api/tick")) as TickInfo));

  const speedTick = () =>
    run("60× + Tick", async () => {
      await call("/api/clock", { speed: 60 });
      return tickNote((await call("/api/tick")) as TickInfo);
    });

  const jumpTick = () =>
    run("+25h + Tick", async () => {
      await call("/api/clock", { jumpHours: 25 });
      return tickNote((await call("/api/tick")) as TickInfo);
    });

  // The per-kind cost lines render nowhere else — this pulls them live so
  // the presenter quotes real numbers at the close (never the blended
  // per-touch figure).
  const showLedger = () =>
    run("Ledger", async () => {
      const res = await fetch("/api/state?scope=hospice");
      const s = await res.json();
      const byKind = s?.cost?.byKind as
        | Record<string, { units: number; usd: number; perUnitUsd: number }>
        | undefined;
      if (!byKind || Object.keys(byKind).length === 0) return "Ledger: no model calls yet.";
      const lines = Object.entries(byKind)
        .map(
          ([k, v]) =>
            `${k.replace(/_/g, " ")} $${v.perUnitUsd.toFixed(4)}/unit (${v.units} × → $${v.usd.toFixed(2)})`,
        )
        .join("  ·  ");
      return `Ledger, live: ${lines}`;
    });

  const copyReferral = async () => {
    try {
      await navigator.clipboard.writeText(REFERRAL);
      setNote("Referral copied — paste it into New order.");
    } catch {
      setError("Clipboard blocked — copy from docs/prod-click-through.md instead.");
    }
  };

  return (
    <div className="flex h-dvh flex-col bg-page">
      <div className="flex min-h-0 flex-1 gap-2 p-2">
        <div className="flex min-w-0 flex-[3] flex-col overflow-hidden rounded-lg border-2 border-navy bg-surface">
          <PanelLabel
            icon={<CrossIcon />}
            who="HOSPICE"
            detail="case manager's board · laptop"
            accent="bg-navy"
          />
          <iframe src="/board" title="Hospice board" className="h-full w-full flex-1 border-0" />
        </div>
        <div className="flex w-[340px] shrink-0 flex-col gap-2 md:w-[380px]">
          <div className="flex min-h-0 flex-[3] flex-col overflow-hidden rounded-lg border-2 border-teal bg-surface">
            <PanelLabel
              icon={<TruckIcon />}
              who="DME VENDOR"
              detail="dispatcher's phone · magic link, no login"
              accent="bg-teal"
            />
            <iframe src="/v/demo-vendor" title="Vendor dispatch" className="h-full w-full flex-1 border-0" />
          </div>
          <div className="flex min-h-0 flex-[2] flex-col overflow-hidden rounded-lg border-2 border-brand bg-surface">
            <PanelLabel
              icon={<FamilyIcon />}
              who="THE CHECKETTS FAMILY"
              detail="each family gets their own read-only link, texted to them — this one follows M. Checketts"
              accent="bg-brand"
            />
            <iframe src="/f/demo-family" title="Family tracker" className="h-full w-full flex-1 border-0" />
          </div>
        </div>
      </div>

      <div className="border-t border-line-strong bg-navy px-3 py-2.5 text-white">
        {!keyLoaded ? null : !key ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/80">Control bar is locked — paste the Hermes secret:</span>
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
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1.5 shrink-0 rounded-sm bg-brand px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                Demo controls
              </span>
              {sim && (
                <span
                  className="mr-1.5 shrink-0 rounded-sm border border-white/20 px-2 py-0.5 text-xs font-semibold tabular-nums text-white/90"
                  title="Simulated world clock — all deadlines and SLAs in the panels are measured against this time"
                >
                  {new Date(sim.now).toLocaleString([], {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  {sim.speed !== 1 && <span className="ml-1.5 text-teal">{sim.speed}×</span>}
                </span>
              )}
              <button
                onClick={resetWorld}
                disabled={busy}
                className="rounded-md border border-white/25 px-2.5 py-1.5 text-xs font-semibold hover:bg-white/10 disabled:opacity-50"
              >
                Reset world
              </button>
              <button
                onClick={copyReferral}
                disabled={busy}
                className="rounded-md border border-white/25 px-2.5 py-1.5 text-xs font-semibold hover:bg-white/10 disabled:opacity-50"
              >
                Copy referral
              </button>
              <span className="mx-1 h-5 w-px bg-white/20" />
              <button
                onClick={tickNow}
                disabled={busy}
                className="rounded-md bg-teal px-2.5 py-1.5 text-xs font-bold text-navy hover:opacity-90 disabled:opacity-50"
              >
                Tick now
              </button>
              <button
                onClick={speedTick}
                disabled={busy}
                className="rounded-md bg-brand px-2.5 py-1.5 text-xs font-bold hover:bg-brand-alt disabled:opacity-50"
              >
                Speed 60× + Tick
              </button>
              <button
                onClick={jumpTick}
                disabled={busy}
                className="rounded-md bg-brand px-2.5 py-1.5 text-xs font-bold hover:bg-brand-alt disabled:opacity-50"
              >
                +25h + Tick
              </button>
              <span className="mx-1 h-5 w-px bg-white/20" />
              <button
                onClick={showLedger}
                disabled={busy}
                className="rounded-md border border-white/25 px-2.5 py-1.5 text-xs font-semibold hover:bg-white/10 disabled:opacity-50"
              >
                Ledger
              </button>
              {busy && <span className="text-xs text-white/60">…</span>}
            </div>
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
  icon: React.ReactNode;
  who: string;
  detail: string;
  accent: string;
}) {
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 text-white ${accent}`}>
      <span className="leading-none">{icon}</span>
      <span className="text-xs font-bold tracking-wider">{who}</span>
      <span className="text-[11px] text-white/75">{detail}</span>
    </div>
  );
}

// Line icons in the label's own color — emoji here read as "generated"
// (Will's call, and he was right); these match the text weight instead.
function iconProps() {
  return {
    width: 14,
    height: 14,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

function CrossIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

function TruckIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M14 17V6a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v11" />
      <path d="M14 8h4l4 4v5h-3" />
      <circle cx="6.5" cy="17.5" r="2" />
      <circle cx="16.5" cy="17.5" r="2" />
      <path d="M8.5 17.5h6" />
    </svg>
  );
}

function FamilyIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20v-1.5a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5V20" />
      <circle cx="17.5" cy="9.5" r="2.5" />
      <path d="M17.5 14.5a4 4 0 0 1 4 4v1" />
    </svg>
  );
}
