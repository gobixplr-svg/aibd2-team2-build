"use client";

import { useMemo, useState } from "react";
import type { ExtractedOrder } from "@/lib/ai/extract-order";
import type { Order, Patient, Urgency, Vendor } from "@/lib/contracts";
import { CATALOG, DON_THRESHOLD_MONTHLY } from "@/lib/data/catalog";

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

let orderSeq = 1100;

// New-order modal — sits over the Patients tab rather than its own page
// (turn 2 of the wireframes). Closing it returns to the row you started
// from; the census behind it never reflows.
export function OrderFormModal({
  vendors,
  patients,
  initialPatientId,
  onPlace,
  onCancel,
}: {
  vendors: Vendor[];
  patients: Patient[];
  initialPatientId?: string;
  onPlace: (order: Order) => void;
  onCancel: () => void;
}) {
  const activePatients = patients.filter((p) => p.status !== "deceased");
  const [patientId, setPatientId] = useState(
    initialPatientId ?? activePatients[0]?.id ?? patients[0]?.id ?? "",
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [urgency, setUrgency] = useState<Urgency>("routine");
  const [targetAt, setTargetAt] = useState(() => {
    const d = new Date(Date.now() + 4 * 3600_000);
    d.setMinutes(0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [dispatchSource, setDispatchSource] = useState<"on_hand" | "vendor">("vendor");
  const [vendorId, setVendorId] = useState<string | null>(null);

  // AI intake: paste a referral, Claude proposes a draft, the human
  // reviews every field below before placing. Extraction never writes
  // an order — it only pre-fills this form.
  const [referral, setReferral] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [draft, setDraft] = useState<ExtractedOrder | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);

  async function extract() {
    if (!referral.trim() || extracting) return;
    setExtracting(true);
    setExtractError(null);
    try {
      const res = await fetch("/api/extract-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: referral }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "extraction failed");
      const d = json.draft as ExtractedOrder;
      setDraft(d);
      setSelected(new Set(d.items.map((i) => i.value)));
      setUrgency(d.urgency.value);
      if (d.patientId) setPatientId(d.patientId.value);
      if (d.targetHoursFromNow) {
        const t = new Date(Date.now() + d.targetHoursFromNow.value * 3600_000);
        t.setMinutes(0, 0, 0);
        setTargetAt(t.toISOString().slice(0, 16));
      }
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "extraction failed");
    } finally {
      setExtracting(false);
    }
  }

  // hcpcs → confidence, for the chips on the equipment list.
  const itemConfidence = useMemo(
    () => new Map((draft?.items ?? []).map((i) => [i.value, i.confidence])),
    [draft],
  );

  const patient = patients.find((p) => p.id === patientId);
  const items = CATALOG.filter((c) => selected.has(c.hcpcs));
  const monthlyBase = items.reduce((s, i) => s + i.monthly, 0);
  const needsDon = items.some((i) => i.highCost || i.monthly > DON_THRESHOLD_MONTHLY);

  const vendorRows = useMemo(
    () =>
      vendors.map((v) => {
        const f = FULFILLMENT[v.id] ?? FULFILLMENT.v1;
        const backordered = items.filter((i) => f.backorder.includes(i.hcpcs));
        const onTimeRate = urgency === "stat" ? v.stats?.statOnTimeRate : v.stats?.onTimeRate;
        const fit = Math.round(((onTimeRate ?? 0.8) - backordered.length * 0.25) * 100);
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

  function place() {
    if (!patient || !vendorId || items.length === 0) return;
    const order: Order = {
      id: `ord-${orderSeq++}`,
      patientId: patient.id,
      patientLabel: patient.label,
      address: "Address on file (synthetic)",
      items: items.map((i) => ({ hcpcs: i.hcpcs, name: i.name })),
      urgency,
      vendorId,
      targetAt: new Date(targetAt).toISOString(),
      state: "ordered",
      note: needsDon
        ? "Contains a high-cost item — routed to DON approval in parallel."
        : undefined,
      timestamps: { ordered: new Date().toISOString() },
    };
    onPlace(order);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/45 p-4 sm:p-6"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-4xl rounded-2xl bg-surface shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-5 py-4">
          <div className="flex-1">
            <div className="text-sm font-semibold text-ink">New order</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
              {activePatients.length > 1 ? (
                <select
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                  className="rounded-sm border border-line bg-surface px-1.5 py-0.5 text-xs text-ink"
                >
                  {activePatients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} · {p.id}
                    </option>
                  ))}
                </select>
              ) : (
                <span>
                  {patient?.label} · {patient?.id}
                </span>
              )}
              {draft &&
                (draft.patientId ? (
                  draft.patientId.value === patientId && (
                    <Conf value={draft.patientId.confidence} />
                  )
                ) : (
                  <span className="rounded-full bg-critical/10 px-1.5 py-0.5 text-[9px] font-semibold text-critical">
                    no patient match — pick one
                  </span>
                ))}
            </div>
          </div>
          <button
            onClick={onCancel}
            aria-label="Close"
            className="text-sm text-muted hover:text-ink-soft"
          >
            ✕
          </button>
        </div>

        <div className="border-b border-line bg-page px-5 py-3.5">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-wide text-muted">
              0 · Paste referral — AI intake
            </span>
            {draft && (
              <span
                className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                  draft.aiUsed ? "bg-teal/15 text-teal" : "bg-cream text-ink"
                }`}
              >
                {draft.aiUsed
                  ? "Claude draft — review each field"
                  : `keyword match only (${draft.fallbackReason ?? "AI unavailable"}) — review carefully`}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <textarea
              value={referral}
              onChange={(e) => setReferral(e.target.value)}
              rows={draft ? 2 : 3}
              placeholder="Paste the referral / discharge summary here — e.g. “Discharging Ruth C. home this afternoon, needs hospital bed with rails and O2 at 2L, family says by 5pm.”"
              className="flex-1 resize-none rounded-md border border-dashed border-line-strong bg-surface px-3 py-2 text-[11px] leading-relaxed text-ink placeholder:text-muted"
            />
            <button
              onClick={extract}
              disabled={!referral.trim() || extracting}
              className="self-start rounded-md bg-brand px-3.5 py-2 text-[11px] font-semibold text-white disabled:opacity-40"
            >
              {extracting ? "Extracting…" : draft ? "Re-extract" : "Extract"}
            </button>
          </div>
          {extractError && (
            <div className="mt-1.5 text-[10px] text-critical">{extractError}</div>
          )}
          {draft && draft.unmapped.length > 0 && (
            <div className="mt-2 rounded-md bg-cream px-3 py-2 text-[10.5px] leading-relaxed text-ink">
              <span className="font-semibold">Didn&apos;t map:</span>{" "}
              {draft.unmapped.map((u) => `“${u}”`).join(" · ")} — handle these
              yourself before placing.
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr] overflow-y-auto">
          <div className="border-b md:border-b-0 md:border-r border-line p-5 flex flex-col gap-5">
            <Field label="1 · Equipment">
              <div className="flex flex-col gap-1.5">
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
                      className={`flex items-center gap-2.5 rounded-md border px-3 py-2 text-left text-[11.5px] ${
                        on ? "border-brand bg-cream" : "border-line bg-surface"
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 shrink-0 rounded-[4px] border ${
                          on ? "border-brand bg-brand" : "border-line-strong"
                        }`}
                      />
                      <span className="min-w-[52px] font-mono text-[10px] text-muted">
                        {c.hcpcs}
                      </span>
                      <span className="flex-1 text-ink">{c.name}</span>
                      {itemConfidence.has(c.hcpcs) && (
                        <Conf value={itemConfidence.get(c.hcpcs)!} />
                      )}
                      <span className="text-[9.5px] text-muted">
                        ${c.monthly}/mo
                        {(c.highCost || c.monthly > DON_THRESHOLD_MONTHLY) && " · DON"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Field>

            <div className="flex gap-3.5">
              <div className="flex-1">
                <Field
                  label="2 · Urgency"
                  chip={draft ? <Conf value={draft.urgency.confidence} /> : undefined}
                >
                  <div className="flex gap-1.5">
                    {(["routine", "stat"] as const).map((u) => (
                      <button
                        key={u}
                        onClick={() => setUrgency(u)}
                        className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
                          urgency === u
                            ? u === "stat"
                              ? "border-brand text-brand"
                              : "border-line-strong text-ink"
                            : "border-line text-ink-soft"
                        }`}
                      >
                        {u === "stat" ? "STAT" : "Routine"}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
              <div className="flex-[1.1]">
                <Field
                  label="3 · Target"
                  chip={
                    draft?.targetHoursFromNow ? (
                      <Conf value={draft.targetHoursFromNow.confidence} />
                    ) : undefined
                  }
                >
                  <input
                    type="datetime-local"
                    value={targetAt}
                    onChange={(e) => setTargetAt(e.target.value)}
                    className="w-full rounded-md border border-dashed border-line-strong bg-page px-2.5 py-2 text-[11px] text-ink"
                  />
                </Field>
              </div>
            </div>

            <div className="rounded-lg border border-dashed border-line-strong bg-page p-3">
              <span className="mb-2 inline-block rounded-full border border-line-strong px-2 py-0.5 text-[9px] uppercase tracking-wide text-ink-soft">
                Pending
              </span>
              <div className="mb-2 text-[9px] uppercase tracking-wide text-muted">
                Dispatch source
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setDispatchSource("on_hand")}
                  className={`flex-1 rounded-md border px-2.5 py-2 text-left text-[11px] ${
                    dispatchSource === "on_hand" ? "border-brand bg-surface" : "border-line bg-surface"
                  }`}
                >
                  Hospice on-hand
                </button>
                <button
                  onClick={() => setDispatchSource("vendor")}
                  className={`flex-1 rounded-md border px-2.5 py-2 text-left text-[11px] ${
                    dispatchSource === "vendor" ? "border-brand bg-surface" : "border-line bg-surface"
                  }`}
                >
                  Vendor dispatch
                </button>
              </div>
              <div className="mt-2 text-[10px] text-muted">
                Not signed off yet — on-hand inventory tracking lands later this build.
              </div>
            </div>
          </div>

          <div className="bg-page p-5 flex flex-col">
            <div className="mb-0.5 text-[9px] uppercase tracking-wide text-muted">4 · Vendor</div>
            <div className="mb-2 text-[10px] text-muted">Ranked: on-time, then cost, then fit</div>
            <div className="grid grid-cols-[1.3fr_.8fr_.6fr_.6fr] gap-1 border-b border-line pb-1.5 text-[9px] uppercase tracking-wide text-muted">
              <div>Vendor</div>
              <div>On-time</div>
              <div>Cost</div>
              <div>Fit</div>
            </div>
            <div className="flex flex-col">
              {vendorRows.map((row) => (
                <button
                  key={row.vendor.id}
                  onClick={() => setVendorId(row.vendor.id)}
                  disabled={items.length === 0}
                  className={`grid grid-cols-[1.3fr_.8fr_.6fr_.6fr] items-center gap-1 border-b border-line bg-surface px-2 py-2.5 text-left text-[11px] disabled:opacity-40 ${
                    vendorId === row.vendor.id ? "ring-1 ring-inset ring-brand" : ""
                  }`}
                >
                  <div>
                    <div className="font-medium text-ink">{row.vendor.name}</div>
                    {!row.vendor.connected && (
                      <div className="text-[9px] leading-tight text-muted">
                        not yet connected — Handoff still tracks it
                      </div>
                    )}
                  </div>
                  <div className="font-medium text-teal">
                    {row.backordered.length > 0
                      ? "backordered"
                      : `${Math.round((row.onTimeRate ?? 0) * 100)}%`}
                  </div>
                  <div>{items.length ? `$${row.monthly}` : "—"}</div>
                  <div className={row.fit < 60 ? "text-critical" : ""}>
                    {items.length ? row.fit : "—"}
                  </div>
                </button>
              ))}
            </div>

            {needsDon && (
              <div className="mt-3.5 rounded-lg bg-cream p-2.5 text-[11px] leading-relaxed text-ink">
                High-cost item — routes to the DON approval inbox. It still sends;
                approval is not a block.
              </div>
            )}

            <div className="mt-auto flex gap-2 pt-4">
              <button
                onClick={place}
                disabled={!vendorId || items.length === 0}
                className="flex-1 rounded-md bg-brand px-3 py-2.5 text-center text-xs font-semibold text-white disabled:opacity-40"
              >
                Place order
              </button>
              <button
                onClick={onCancel}
                className="rounded-md border border-line-strong bg-surface px-4 py-2.5 text-xs text-ink-soft"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  chip,
  children,
}: {
  label: string;
  chip?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wide text-muted">
        {label}
        {chip}
      </div>
      {children}
    </div>
  );
}

// Per-field confidence, rendered verbatim from the extraction. Below
// 0.7 the extractor itself says a human should look closely — so it
// reads as a warning, not a stat.
function Conf({ value }: { value: number }) {
  const low = value < 0.7;
  return (
    <span
      title={low ? "Low confidence — check this field" : "Extraction confidence"}
      className={`rounded-full px-1.5 py-0.5 font-mono text-[9px] font-semibold normal-case tracking-normal ${
        low ? "bg-critical/10 text-critical" : "bg-teal/15 text-teal"
      }`}
    >
      {Math.round(value * 100)}%{low ? " ⚠" : ""}
    </span>
  );
}
