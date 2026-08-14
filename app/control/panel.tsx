"use client";

// The stage console. One page for the person driving the demo:
// tick Hermes, run the clock fast, jump hours, reset the world.
//
// The HERMES_SECRET is typed once by the operator and kept in
// sessionStorage — never baked into the bundle. Every button calls the
// existing guarded endpoints with the x-hermes-secret header; the
// server compares, so a wrong key is a 403, not a broken page.

import { useCallback, useEffect, useState } from "react";

interface TickResult {
  at: string;
  scanned: number;
  interesting: number;
  inboxCreated: number;
  aiUsed: boolean;
  fallbackReason?: string;
  tokensUsed: number;
  costUsd: number;
}

interface ClockStatus {
  now: string;
  real: string;
  clock: { speed: number };
}

const SPEEDS = [1, 60, 600, 3600];
const JUMPS = [2, 6, 25];

export function ControlPanel() {
  const [key, setKey] = useState("");
  const [status, setStatus] = useState<ClockStatus | null>(null);
  const [lastTick, setLastTick] = useState<TickResult | null>(null);
  const [lastReset, setLastReset] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Deferred — same never-a-sync-setState convention as use-world.ts.
    const id = setTimeout(() => setKey(sessionStorage.getItem("hermes-key") ?? ""), 0);
    return () => clearTimeout(id);
  }, []);

  const saveKey = (k: string) => {
    setKey(k);
    sessionStorage.setItem("hermes-key", k);
  };

  const call = useCallback(
    async (label: string, url: string, body?: unknown) => {
      setBusy(label);
      setError(null);
      try {
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
          throw new Error(
            res.status === 403 ? "forbidden — check the key" : (json.error ?? "failed"),
          );
        }
        return json;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setBusy(null);
      }
    },
    [key],
  );

  const refreshClock = useCallback(async () => {
    try {
      const res = await fetch("/api/clock", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) setStatus(json);
    } catch {
      /* transient */
    }
  }, []);

  useEffect(() => {
    const kick = setTimeout(refreshClock, 0);
    const id = setInterval(refreshClock, 1000);
    return () => {
      clearTimeout(kick);
      clearInterval(id);
    };
  }, [refreshClock]);

  async function doTick() {
    const json = await call("tick", "/api/tick");
    if (json) setLastTick(json as TickResult);
  }
  async function setSpeed(speed: number) {
    if (await call(`speed-${speed}`, "/api/clock", { speed })) refreshClock();
  }
  async function jump(hours: number) {
    if (await call(`jump-${hours}`, "/api/clock", { jumpHours: hours })) refreshClock();
  }
  async function clockReset() {
    if (await call("clock-reset", "/api/clock", { reset: true, speed: 1 })) refreshClock();
  }
  async function resetWorld() {
    if (!window.confirm("Wipe and reseed the whole world?")) return;
    const json = await call("reset", "/api/reset");
    if (json) {
      setLastReset(
        `Seeded ${json.seeded.patients} patients · ${json.seeded.vendors} vendors · ${json.seeded.orders} orders${json.persistent ? "" : " (in-memory!)"}`,
      );
      setLastTick(null);
      refreshClock();
    }
  }

  const speed = status?.clock.speed ?? 1;

  return (
    <div className="min-h-dvh bg-page p-6">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <header className="flex items-baseline gap-3">
          <span className="text-[15px] font-bold text-ink">Handoff</span>
          <span className="text-xs text-muted">demo control — not part of the product demo</span>
        </header>

        <section className="rounded-xl border border-line bg-surface p-4">
          <div className="mb-2 text-[9px] uppercase tracking-wide text-muted">Access</div>
          <input
            type="password"
            value={key}
            onChange={(e) => saveKey(e.target.value)}
            placeholder="HERMES_SECRET (blank in local dev)"
            className="w-full rounded-md border border-dashed border-line-strong bg-page px-3 py-2 text-[11px] font-mono text-ink placeholder:text-muted"
          />
          <div className="mt-1.5 text-[10px] text-muted">
            Kept in this tab&apos;s sessionStorage only. The server checks it on every call.
          </div>
        </section>

        <section className="rounded-xl border border-line bg-surface p-4">
          <div className="mb-2 flex items-baseline gap-3">
            <span className="text-[9px] uppercase tracking-wide text-muted">Engine clock</span>
            {status && (
              <span className="text-[10px] text-muted">
                {speed === 1 ? "real time" : `${speed}× — a minute every ${speed >= 60 ? `${Math.round(3600 / speed) / 60}s` : `${Math.round(60 / speed)}s`}`}
              </span>
            )}
          </div>
          <div className="mb-3 flex items-baseline gap-4 font-mono tabular-nums">
            <div>
              <div className="text-lg font-semibold text-ink">
                {status ? new Date(status.now).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit", second: "2-digit" }) : "—"}
              </div>
              <div className="text-[9px] uppercase tracking-wide text-muted">engine</div>
            </div>
            <div>
              <div className="text-lg text-ink-soft">
                {status ? new Date(status.real).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }) : "—"}
              </div>
              <div className="text-[9px] uppercase tracking-wide text-muted">wall</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                disabled={busy !== null}
                className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold disabled:opacity-40 ${
                  speed === s ? "border-brand text-brand" : "border-line-strong text-ink-soft"
                }`}
              >
                {s}×
              </button>
            ))}
            <span className="mx-1 self-center text-[10px] text-muted">·</span>
            {JUMPS.map((h) => (
              <button
                key={h}
                onClick={() => jump(h)}
                disabled={busy !== null}
                className="rounded-full border border-line-strong px-3 py-1.5 text-[11px] text-ink-soft disabled:opacity-40"
              >
                +{h}h
              </button>
            ))}
            <button
              onClick={clockReset}
              disabled={busy !== null}
              className="ml-auto rounded-full border border-line-strong px-3 py-1.5 text-[11px] text-ink-soft disabled:opacity-40"
            >
              Back to real time
            </button>
          </div>
          <div className="mt-2 text-[10px] leading-relaxed text-muted">
            +25h ages a triggered pickup past its 24h window. The engine reads this clock —
            nothing is faked, time just runs faster.
          </div>
        </section>

        <section className="rounded-xl border border-line bg-surface p-4">
          <div className="mb-2 text-[9px] uppercase tracking-wide text-muted">Hermes heartbeat</div>
          <div className="flex items-center gap-3">
            <button
              onClick={doTick}
              disabled={busy !== null}
              className="rounded-md bg-brand px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              {busy === "tick" ? "Ticking…" : "Tick now"}
            </button>
            <div className="text-[10px] leading-relaxed text-muted">
              Cron runs this every 5 min in real time. On stage we tick by hand between beats —
              same function, same clock parameter.
            </div>
          </div>
          {lastTick && (
            <div className="mt-3 rounded-md bg-page px-3 py-2.5 font-mono text-[11px] leading-relaxed text-ink">
              scanned {lastTick.scanned} · interesting {lastTick.interesting} · inbox +{lastTick.inboxCreated}
              <br />
              {lastTick.aiUsed
                ? `AI triage ran — ${lastTick.tokensUsed} tokens, $${lastTick.costUsd.toFixed(4)}`
                : `rules-only (${lastTick.fallbackReason ?? "nothing interesting"}) — $0`}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-critical/40 bg-surface p-4">
          <div className="mb-2 text-[9px] uppercase tracking-wide text-critical">Danger</div>
          <div className="flex items-center gap-3">
            <button
              onClick={resetWorld}
              disabled={busy !== null}
              className="rounded-md border-[1.5px] border-critical px-4 py-2.5 text-xs font-semibold text-critical disabled:opacity-40"
            >
              Reset world
            </button>
            <div className="text-[10px] leading-relaxed text-muted">
              Wipe + reseed, deterministic. Run before every rehearsal and once before the real
              demo — never during it.
            </div>
          </div>
          {lastReset && (
            <div className="mt-3 rounded-md bg-page px-3 py-2.5 font-mono text-[11px] text-ink">
              {lastReset}
            </div>
          )}
        </section>

        {error && (
          <div className="rounded-md border border-critical/40 bg-surface px-3 py-2.5 text-[11px] text-critical">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
