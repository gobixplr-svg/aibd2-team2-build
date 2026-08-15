"use client";

import { useMemo, useState } from "react";
import type { Order, Patient, Vendor } from "@/lib/contracts";
import {
  daysOnRent,
  dmeSpendFor,
  lengthOfUseRows,
  ordersToCsv,
  patientDaysOnCensus,
  postPickupIdleCost,
  postPickupIdleDays,
  spendByCategory,
  topEquipment,
  vendorPerformance,
} from "./derive";

// Wireframe turn 3, 3c. Every number here reads off order/vendor
// records the app already writes. The seed has no real multi-month
// history, so the "DME cost over time" trend chart is reshaped into a
// by-category breakdown — real and derivable — rather than a fabricated
// 7-month series with an invented "+26% vs Sep."
export function AnalyticsTab({
  orders,
  patients,
  vendors,
  now,
}: {
  orders: Order[];
  patients: Patient[];
  vendors: Vendor[];
  now: number;
}) {
  const [vendorFilter, setVendorFilter] = useState<string>("All");

  const scoped = vendorFilter === "All" ? orders : orders.filter((o) => o.vendorId === vendorFilter);

  const totalSpend = dmeSpendFor(scoped);
  const totalPatientDays = patients.reduce((s, p) => s + patientDaysOnCensus(p, scoped), 0);
  const costPerPatientDay = totalPatientDays > 0 ? totalSpend / totalPatientDays : null;

  const delivered = scoped.filter((o) => o.timestamps.delivered);
  const avgDaysOnDme =
    delivered.length > 0
      ? delivered.reduce((s, o) => s + daysOnRent(o), 0) / delivered.length
      : 0;

  // now is engine time (state.now from /api/state) — must match what the
  // money counter in the board header and /api/state used, or this and
  // that number can disagree the moment the demo clock runs fast.
  const idleDays = postPickupIdleDays(scoped, now);
  const idleCost = postPickupIdleCost(scoped, now);

  const categories = useMemo(() => spendByCategory(scoped), [scoped]);
  const maxCategory = Math.max(1, ...categories.map((c) => c.amount));
  const topItems = useMemo(() => topEquipment(scoped).slice(0, 6), [scoped]);
  const maxCount = Math.max(1, ...topItems.map((i) => i.count));
  const losRows = useMemo(() => lengthOfUseRows(scoped), [scoped]);
  const maxAvgDays = Math.max(1, ...losRows.map((r) => r.avgDays));
  const vendorPerf = useMemo(() => vendorPerformance(scoped, vendors), [scoped, vendors]);

  function exportCsv() {
    const csv = ordersToCsv(scoped);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `handoff-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[10px]">
        <span className="text-muted">All synthetic orders on file · no historical partition yet</span>
        <select
          value={vendorFilter}
          onChange={(e) => setVendorFilter(e.target.value)}
          className="ml-auto rounded-md border border-dashed border-line-strong bg-page px-2.5 py-1.5 text-[11px] text-ink"
        >
          <option value="All">All vendors</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <button
          onClick={exportCsv}
          className="rounded-md border border-dashed border-line-strong bg-page px-2.5 py-1.5 text-[11px] text-ink-soft"
        >
          Export CSV
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="DME spend to date" value={`$${totalSpend.toLocaleString()}`} />
        <StatTile
          label="Cost per patient-day"
          value={costPerPatientDay !== null ? `$${costPerPatientDay.toFixed(2)}` : "—"}
          sub={`census ${patients.length}`}
        />
        <StatTile label="Avg days on DME" value={avgDaysOnDme.toFixed(0)} sub="per asset placed" />
        <StatTile
          label="Post-pickup idle days"
          value={idleDays.toFixed(0)}
          sub={idleCost > 0 ? `≈ $${idleCost.toLocaleString()} avoidable` : "none right now"}
          critical={idleDays > 0}
        />
      </div>

      <div className="mb-3.5 grid grid-cols-1 gap-3.5 lg:grid-cols-[1.25fr_1fr]">
        <div className="rounded-xl border border-line p-4">
          <div className="mb-3.5 flex items-baseline gap-2">
            <div className="text-xs font-semibold text-ink">DME cost by equipment category</div>
            <div className="text-[10px] text-muted">spend to date</div>
          </div>
          <div className="flex h-[150px] items-end gap-4 border-b border-line pb-0.5">
            {categories.map((c) => (
              <div key={c.category} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <div className="text-[9px] text-muted">${c.amount}</div>
                <div
                  className="w-full rounded-t-[5px] bg-secondary"
                  style={{ height: `${Math.max((c.amount / maxCategory) * 100, 2)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-4">
            {categories.map((c) => (
              <div key={c.category} className="flex-1 text-center text-[9.5px] text-muted">
                {c.category}
              </div>
            ))}
          </div>
          {categories.length === 0 && (
            <div className="py-6 text-center text-[11px] text-muted">No spend on file yet.</div>
          )}
        </div>

        <div className="rounded-xl border border-line p-4">
          <div className="mb-0.5 text-xs font-semibold text-ink">Most-ordered equipment</div>
          <div className="mb-3.5 text-[10px] text-muted">orders placed · spend to date</div>
          {topItems.map((i) => (
            <div key={i.hcpcs} className="mb-2.5">
              <div className="mb-1 flex items-baseline gap-2 text-[11px]">
                <span className="font-mono text-[9.5px] text-muted">{i.hcpcs}</span>
                <span className="flex-1 text-ink">{i.label}</span>
                <span className="font-semibold text-ink">{i.count}</span>
                <span className="min-w-[48px] text-right text-[10px] text-muted">
                  ${Math.round(i.spend)}
                </span>
              </div>
              <div className="h-[7px] rounded-sm bg-line">
                <div
                  className="h-[7px] rounded-sm bg-teal"
                  style={{ width: `${Math.max((i.count / maxCount) * 100, 4)}%` }}
                />
              </div>
            </div>
          ))}
          {topItems.length === 0 && (
            <div className="py-6 text-center text-[11px] text-muted">No orders on file yet.</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.15fr_1fr]">
        <div className="rounded-xl border border-line p-4">
          <div className="mb-0.5 text-xs font-semibold text-ink">Length of use per patient</div>
          <div className="mb-3.5 text-[10px] text-muted">
            avg days placed, and the days sitting idle after pickup was due
          </div>
          <div className="grid grid-cols-[1.5fr_2fr_.6fr_.6fr] gap-2.5 border-b border-line pb-2 text-[9px] uppercase tracking-wide text-muted">
            <div>Item</div>
            <div>Avg days</div>
            <div className="text-right">Idle</div>
            <div className="text-right">Rate</div>
          </div>
          {losRows.map((l) => (
            <div
              key={l.hcpcs}
              className="grid grid-cols-[1.5fr_2fr_.6fr_.6fr] items-center gap-2.5 border-b border-line py-2.5 text-[11px]"
            >
              <div>
                <div className="text-ink">{l.label}</div>
                <div className="font-mono text-[9px] text-muted">{l.hcpcs}</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-[7px] flex-1 rounded-sm bg-line">
                  <div
                    className="h-[7px] rounded-sm bg-secondary"
                    style={{ width: `${Math.max((l.avgDays / maxAvgDays) * 100, 4)}%` }}
                  />
                </div>
                <span className="min-w-[42px] text-[10px] text-ink">{l.avgDays.toFixed(0)}d</span>
              </div>
              <div className="text-right text-[10px] text-critical">
                {l.idleDays > 0 ? `${l.idleDays.toFixed(0)}d` : "—"}
              </div>
              <div className="text-right text-[10px] text-ink-soft">${l.dailyRate.toFixed(2)}</div>
            </div>
          ))}
          {losRows.length === 0 && (
            <div className="py-6 text-center text-[11px] text-muted">
              Nothing delivered yet — length of use needs a delivery timestamp.
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3.5">
          <div className="rounded-xl border border-line p-4">
            <div className="mb-0.5 text-xs font-semibold text-ink">Vendor performance</div>
            <div className="mb-3.5 text-[10px] text-muted">the numbers the order form ranks on</div>
            {vendorPerf.map(({ vendor, spend }) => (
              <div key={vendor.id} className="border-b border-line py-2.5 last:border-b-0">
                <div className="mb-1.5 flex items-baseline gap-2 text-[11px]">
                  <span className="flex-1 font-medium text-ink">{vendor.name}</span>
                  <span className="font-semibold text-ink">
                    {Math.round((vendor.stats?.onTimeRate ?? 0) * 100)}%
                  </span>
                </div>
                <div className="mb-1.5 h-[7px] rounded-sm bg-line">
                  <div
                    className="h-[7px] rounded-sm bg-teal"
                    style={{ width: `${Math.round((vendor.stats?.onTimeRate ?? 0) * 100)}%` }}
                  />
                </div>
                <div className="flex gap-3.5 text-[9.5px] text-muted">
                  <span>STAT {Math.round((vendor.stats?.statOnTimeRate ?? 0) * 100)}%</span>
                  <span>pickup {vendor.stats?.avgPickupHours ?? "—"}h</span>
                  <span className="ml-auto">${spend.toLocaleString()}</span>
                </div>
              </div>
            ))}
            {vendorPerf.length === 0 && (
              <div className="py-4 text-center text-[11px] text-muted">No vendor orders yet.</div>
            )}
          </div>

          <div className="rounded-xl border border-dashed border-line-strong bg-page p-3.5">
            <span className="mb-2 inline-block rounded-full border border-line-strong px-2 py-0.5 text-[9px] uppercase tracking-wide text-ink-soft">
              Pending
            </span>
            <div className="mb-1.5 text-[10px] uppercase tracking-wide text-muted">
              Utilization insight
            </div>
            <div className="text-[11px] leading-relaxed text-ink">
              Carrying 6 beds against 1.8/week usage — 2 would cover it. CPAP idles 31% of its
              placement; consider on-hand instead of rental.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  critical,
}: {
  label: string;
  value: string;
  sub?: string;
  critical?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line p-3.5">
      <div className="mb-1.5 text-[9px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`text-2xl font-semibold ${critical ? "text-critical" : "text-ink"}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[10px] text-muted">{sub}</div>}
    </div>
  );
}
