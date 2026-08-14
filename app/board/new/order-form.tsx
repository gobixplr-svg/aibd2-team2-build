"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Order, Patient, Urgency, Vendor } from "@/lib/contracts";
import { CATALOG, DON_THRESHOLD_MONTHLY } from "@/lib/data/catalog";
import { useWorld } from "@/lib/use-world";

// Per-vendor synthetic fulfillment profile for the picker. Real version
// reads vendor stats + (future) live inventory; the interface is shaped
// for that swap (FAQ: design forward-compatible, graceful fallback).
const FULFILLMENT: Record<
  string,
  { statWindow: string; routineWindow: string; costFactor: number; backorder: string[] }
> = {
  v1: { statWindow: "~2h", routineWindow: "same day", costFactor: 1.0, backorder: [] },
  v2: { statWindow: "4–6h", routineWindow: "next day", costFactor: 0.92, backorder: ["E0250"] },
};

export function OrderForm() {
  const { state } = useWorld<{ vendors: Vendor[]; patients: Patient[] }>();
  const [patientId, setPatientId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [urgency, setUrgency] = useState<Urgency>("routine");
  const [targetAt, setTargetAt] = useState(() => {
    const d = new Date(Date.now() + 4 * 3600_000);
    d.setMinutes(0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [placed, setPlaced] = useState<Order | null>(null);

  const vendors = useMemo(() => state?.vendors ?? [], [state?.vendors]);
  const patients = (state?.patients ?? []).filter((p) => p.status === "active");
  const items = CATALOG.filter((c) => selected.has(c.hcpcs));
  const monthlyBase = items.reduce((s, i) => s + i.monthly, 0);
  const needsDon = items.some((i) => i.highCost || i.monthly > DON_THRESHOLD_MONTHLY);

  const vendorRows = useMemo(
    () =>
      vendors.map((v) => {
        const f = FULFILLMENT[v.id] ?? FULFILLMENT.v1;
        const backordered = items.filter((i) => f.backorder.includes(i.hcpcs));
        const onTimeRate = urgency === "stat" ? v.stats?.statOnTimeRate : v.stats?.onTimeRate;
        const fit = Math.round(
          ((onTimeRate ?? 0.8) - backordered.length * 0.25) * 100,
        );
        return {
          vendor: v,
          window: urgency === "stat" ? f.statWindow : f.routineWindow,
          monthly: Math.round(monthlyBase * f.costFactor),
          onTimeRate,
          backordered,
          fit: Math.max(fit, 5),
        };
      }),
    [vendors, items, urgency, monthlyBase],
  );

  async function place() {
    if (!vendorId || items.length === 0 || !patientId) return;
    const patient = patients.find((p) => p.id === patientId)!;
    const body = {
      patientId: patient.id,
      patientLabel: patient.label,
      address: "Address on file (synthetic)",
      items: items.map((i) => ({ hcpcs: i.hcpcs, name: i.name })),
      urgency,
      vendorId,
      targetAt: new Date(targetAt).toISOString(),
      note: needsDon
        ? "Contains a high-cost item — routed to DON approval in parallel."
        : undefined,
    };
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (json.ok) setPlaced(json.order as Order);
  }

  if (placed) {
    return (
      <div className="rounded-lg bg-surface border border-line p-5 flex flex-col gap-3">
        <div className="text-base font-bold text-ink">
          Order {placed.id} placed ✓
        </div>
        <p className="text-sm text-ink-soft">
          {placed.items.map((i) => i.name).join(", ")} → {placed.patientLabel},{" "}
          {placed.urgency === "stat" ? "STAT" : "routine"}, needed by{" "}
          {new Date(placed.targetAt).toLocaleString([], {
            weekday: "short",
            hour: "numeric",
            minute: "2-digit",
          })}
          .{needsDon && " High-cost item routed to the DON approval inbox."}
        </p>
        <p className="text-sm text-ink-soft">
          The vendor sees it <em>now</em> — no portal account, no fax.
        </p>
        <div className="flex gap-2">
          <Link
            href="/board"
            className="rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-white"
          >
            View on the board
          </Link>
          <Link
            href="/v/demo-vendor"
            className="rounded-md border border-line px-4 py-2.5 text-sm font-semibold text-ink-soft"
          >
            Vendor&apos;s phone view
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* patient */}
      <Field label="Patient">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {patients.map((p) => (
            <button
              key={p.id}
              onClick={() => setPatientId(p.id)}
              className={`rounded-md border px-3 py-2.5 text-left ${
                patientId === p.id ? "border-brand bg-cream" : "border-line bg-surface"
              }`}
            >
              <div className="text-sm font-semibold text-ink">{p.label}</div>
            </button>
          ))}
          {patients.length === 0 && (
            <div className="text-xs text-muted py-2">Loading census…</div>
          )}
        </div>
      </Field>

      {/* equipment */}
      <Field label="Equipment (HCPCS)">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {CATALOG.map((c) => {
            const on = selected.has(c.hcpcs);
            return (
              <button
                key={c.hcpcs}
                onClick={() =>
                  setSelected((s) => {
                    const n = new Set(s);
                    if (n.has(c.hcpcs)) n.delete(c.hcpcs);
                    else n.add(c.hcpcs);
                    return n;
                  })
                }
                className={`rounded-md border px-3 py-2.5 text-left ${
                  on ? "border-brand bg-cream" : "border-line bg-surface"
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium text-ink">{c.name}</span>
                  <span className="text-[11px] tabular-nums text-muted">
                    ${c.monthly}/mo
                  </span>
                </div>
                <div className="text-[11px] text-muted">
                  <span className="font-mono">{c.hcpcs}</span>
                  {(c.highCost || c.monthly > DON_THRESHOLD_MONTHLY) && (
                    <span className="ml-1.5 text-ink-soft font-medium">
                      · DON approval
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </Field>

      {/* urgency + deadline */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Urgency">
          <div className="flex gap-2">
            {(["routine", "stat"] as const).map((u) => (
              <button
                key={u}
                onClick={() => setUrgency(u)}
                className={`flex-1 rounded-md border px-3 py-2.5 text-sm font-semibold ${
                  urgency === u
                    ? u === "stat"
                      ? "border-navy bg-navy text-white"
                      : "border-brand bg-cream text-ink"
                    : "border-line bg-surface text-ink-soft"
                }`}
              >
                {u === "stat" ? "STAT" : "Routine"}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Needed by (discharge / target)">
          <input
            type="datetime-local"
            value={targetAt}
            onChange={(e) => setTargetAt(e.target.value)}
            className="w-full rounded-md border border-line bg-surface px-3 py-2.5 text-sm text-ink"
          />
        </Field>
      </div>

      {/* vendor picker — their three decision factors, in their order */}
      <Field
        label="Vendor"
        hint="On time → cost → fit: the three things clinicians told BetterRX they decide on."
      >
        <div className="flex flex-col gap-2">
          {vendorRows.map((row) => (
            <button
              key={row.vendor.id}
              onClick={() => setVendorId(row.vendor.id)}
              disabled={items.length === 0}
              className={`rounded-lg border p-3 text-left disabled:opacity-40 ${
                vendorId === row.vendor.id ? "border-brand bg-cream" : "border-line bg-surface"
              }`}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-ink">
                  {row.vendor.name}
                </span>
                {!row.vendor.connected && (
                  <span className="text-[10px] uppercase tracking-wide text-muted">
                    not yet connected — Handoff still tracks it
                  </span>
                )}
              </div>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                <Metric
                  label="Will it arrive on time?"
                  value={
                    row.backordered.length > 0
                      ? `${row.backordered[0].name.split(",")[0]} backordered`
                      : `${row.window} · ${Math.round((row.onTimeRate ?? 0) * 100)}% on-time`
                  }
                  bad={row.backordered.length > 0}
                />
                <Metric
                  label="Cost"
                  value={items.length ? `$${row.monthly}/mo` : "—"}
                />
                <Metric
                  label="Fit for this order"
                  value={items.length ? `${row.fit}/100` : "—"}
                  bad={row.fit < 60}
                />
              </div>
            </button>
          ))}
        </div>
      </Field>

      <button
        onClick={place}
        disabled={!vendorId || items.length === 0}
        className="rounded-md bg-brand px-4 py-3.5 text-sm font-bold text-white disabled:opacity-40"
      >
        Place order{needsDon ? " (+ request DON approval)" : ""}
      </button>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          {label}
        </span>
        {hint && <span className="text-[11px] text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Metric({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`text-xs font-semibold ${bad ? "text-critical" : "text-ink"}`}>
        {value}
      </div>
    </div>
  );
}
