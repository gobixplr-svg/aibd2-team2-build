"use client";

import { useMemo, useState } from "react";
import type { Order, Patient, Vendor } from "@/lib/contracts";
import { ALL_CATEGORIES, categoryOf } from "@/lib/data/catalog";
import {
  daysOnRent,
  dmeMonthlyRunRate,
  dmeSpendFor,
  lastNMonths,
  lengthOfUseRows,
  monthlyByVendor,
  monthlyDmeCost,
  ordersToCsv,
  patientDaysOnCensus,
  postPickupIdleCost,
  postPickupIdleDays,
  rxSpendMonthlyTotal,
  spendByCategory,
  topEquipment,
  vendorPerformance,
} from "./derive";

// Vendor identity colors for the month-over-month charts — fixed by
// vendor id, never reassigned by filter/rank, so deselecting one vendor
// never repaints another's bars (dataviz rule: color follows the
// entity, not its rank). Teal + brand already pass the palette
// validator; a 3rd vendor needed a new hue — slate/navy both read as
// gray in a bar fill (chroma floor) — see globals.css's chart-blue.
const VENDOR_ACCENT: Record<string, { bar: string; dot: string }> = {
  v1: { bar: "bg-brand", dot: "bg-brand" },
  v2: { bar: "bg-chart-blue", dot: "bg-chart-blue" },
  v3: { bar: "bg-teal", dot: "bg-teal" },
};
const FALLBACK_ACCENT = { bar: "bg-line-strong", dot: "bg-line-strong" };

const MONTH_OPTIONS = [3, 6, 12] as const;

interface ChartFilterScope {
  vendorIds: Set<string>;
  category: string;
  monthsBack: number;
}

function scopeOrders(orders: Order[], vendorIds: Set<string>, category: string): Order[] {
  return orders.filter((o) => {
    if (!vendorIds.has(o.vendorId)) return false;
    if (category === "All") return true;
    return o.items.some((it) => categoryOf(it.hcpcs) === category);
  });
}

// Per-chart filter override — the industry-standard escape hatch from a
// shared filter bar (Tableau's worksheet-scoped filters, Power BI's
// per-visual "sync slicers" toggle, Looker/Omni tiles pinning their own
// dimension). Defaults to "following" the page filters; detaching takes
// a snapshot of them so the chart doesn't jump when it goes custom, and
// re-attaching just drops the snapshot rather than trying to merge it
// back — simplest thing that reads correctly.
function ChartScope({
  vendors,
  globalVendorIds,
  globalCategory,
  globalMonthsBack,
  includeMonths,
  children,
}: {
  vendors: Vendor[];
  globalVendorIds: Set<string>;
  globalCategory: string;
  globalMonthsBack: number;
  includeMonths?: boolean;
  children: (scope: ChartFilterScope) => React.ReactNode;
}) {
  const [custom, setCustom] = useState<ChartFilterScope | null>(null);

  const effective: ChartFilterScope = custom ?? {
    vendorIds: globalVendorIds,
    category: globalCategory,
    monthsBack: globalMonthsBack,
  };

  function detach() {
    setCustom({
      vendorIds: new Set(globalVendorIds),
      category: globalCategory,
      monthsBack: globalMonthsBack,
    });
  }

  function toggleVendor(id: string) {
    setCustom((prev) => {
      const base = prev ?? {
        vendorIds: new Set(globalVendorIds),
        category: globalCategory,
        monthsBack: globalMonthsBack,
      };
      const next = new Set(base.vendorIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...base, vendorIds: next };
    });
  }

  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => (custom ? setCustom(null) : detach())}
          className={`rounded-full border px-2 py-0.5 text-[9px] font-medium ${
            custom
              ? "border-brand bg-brand/10 text-brand"
              : "border-dashed border-line-strong text-muted"
          }`}
        >
          {custom ? "Custom filter · click to follow page" : "Following page filters"}
        </button>
        {custom && (
          <>
            {vendors.map((v) => (
              <button
                key={v.id}
                onClick={() => toggleVendor(v.id)}
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9.5px] ${
                  custom.vendorIds.has(v.id)
                    ? "border-line-strong bg-page text-ink"
                    : "border-dashed border-line text-muted line-through"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${(VENDOR_ACCENT[v.id] ?? FALLBACK_ACCENT).dot}`}
                />
                {v.name}
              </button>
            ))}
            <select
              value={custom.category}
              onChange={(e) => setCustom((c) => (c ? { ...c, category: e.target.value } : c))}
              className="rounded-md border border-dashed border-line-strong bg-page px-2 py-0.5 text-[10px] text-ink"
            >
              <option value="All">All types</option>
              {ALL_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {includeMonths && (
              <select
                value={custom.monthsBack}
                onChange={(e) =>
                  setCustom((c) => (c ? { ...c, monthsBack: Number(e.target.value) } : c))
                }
                className="rounded-md border border-dashed border-line-strong bg-page px-2 py-0.5 text-[10px] text-ink"
              >
                {MONTH_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    Last {m} mo
                  </option>
                ))}
              </select>
            )}
          </>
        )}
      </div>
      {children(effective)}
    </div>
  );
}

// Wireframe turn 3, 3c, now with a year of real history behind it
// (lib/data/seed.ts) instead of ~50 orders in a 90-day window — enough
// density that a month-over-month, filterable trend is honest rather
// than fabricated. One filter bar (vendor + equipment type + date
// range) drives every visual on the page, Omni/BI-dashboard style,
// instead of each chart carrying its own scoped control.
export function AnalyticsTab({
  orders,
  history,
  patients,
  vendors,
  now,
}: {
  orders: Order[];
  history: Order[];
  patients: Patient[];
  vendors: Vendor[];
  now: number;
}) {
  const [vendorFilter, setVendorFilter] = useState<Set<string> | null>(null); // null = all
  const [category, setCategory] = useState<string>("All");
  const [monthsBack, setMonthsBack] = useState<number>(6);

  const activeVendorIds = useMemo(
    () => vendorFilter ?? new Set(vendors.map((v) => v.id)),
    [vendorFilter, vendors],
  );

  function toggleVendor(id: string) {
    setVendorFilter((prev) => {
      const base = prev ?? new Set(vendors.map((v) => v.id));
      const next = new Set(base);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Everything this page can see: the live board's handful of orders
  // plus a full year of completed rental history that never renders on
  // the board itself — see app/api/state/route.ts's `history` field.
  const allOrders = useMemo(() => [...orders, ...history], [orders, history]);

  const vendorScoped = useMemo(
    () => allOrders.filter((o) => activeVendorIds.has(o.vendorId)),
    [allOrders, activeVendorIds],
  );

  // Vendor + equipment-type scoped — drives the stat tiles, equipment
  // ranking, length-of-use, and vendor performance. The category
  // breakdown chart below deliberately uses vendorScoped instead, so
  // narrowing to one type doesn't collapse its own chart to one bar.
  const scoped = useMemo(
    () =>
      category === "All"
        ? vendorScoped
        : vendorScoped.filter((o) => o.items.some((it) => categoryOf(it.hcpcs) === category)),
    [vendorScoped, category],
  );

  // Every duration-based figure below must use ENGINE time (state.now),
  // never the wall clock — demo timestamps run ahead of real time, and a
  // wall-clock "now" clamps days-on-rent to zero, freezing all spend at $0.
  const totalSpend = dmeSpendFor(scoped, now);
  const totalPatientDays = patients.reduce((s, p) => s + patientDaysOnCensus(p, scoped, now), 0);
  const costPerPatientDay = totalPatientDays > 0 ? totalSpend / totalPatientDays : null;

  // Cost-of-care visibility (bounty Required Features, hospice side):
  // "DME spend alongside medication spend, not in a separate silo."
  // Rx is scoped to patients who have an order in the current filter,
  // so the comparison stays honest when a vendor/type is selected.
  const scopedPatientIds = new Set(scoped.map((o) => o.patientId));
  const scopedPatients = patients.filter((p) => scopedPatientIds.has(p.id));
  const dmeMonthly = dmeMonthlyRunRate(scoped);
  const rxMonthly = rxSpendMonthlyTotal(scopedPatients);

  const delivered = scoped.filter((o) => o.timestamps.delivered);
  const avgDaysOnDme =
    delivered.length > 0
      ? delivered.reduce((s, o) => s + daysOnRent(o, now), 0) / delivered.length
      : 0;

  const idleDays = postPickupIdleDays(scoped, now);
  const idleCost = postPickupIdleCost(scoped, now);

  const categories = useMemo(() => spendByCategory(vendorScoped, now), [vendorScoped, now]);
  const maxCategory = Math.max(1, ...categories.map((c) => c.amount));
  const vendorPerf = useMemo(() => vendorPerformance(scoped, vendors), [scoped, vendors]);

  // Raw monthly table — vendor/category-agnostic, computed once. Every
  // month-over-month chart (the shared one below and any that detach
  // into their own filter) pivots this the same way, just with
  // different scope.
  const monthlyRows = useMemo(() => monthlyDmeCost(allOrders, now), [allOrders, now]);

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
      {/* One filter bar drives every visual below — vendor toggles and
          equipment type narrow the stat tiles and every chart except
          the category breakdown (kept unfiltered by category on
          purpose, so it keeps showing the whole mix); the date range
          scopes only the month-over-month trend, the one chart that's
          actually bucketed by time rather than a running total. */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[10px]">
        <span className="text-muted">
          {allOrders.length.toLocaleString()} orders · {patients.length} patients ·{" "}
          {vendors.length} vendors on file
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {vendors.map((v) => (
            <button
              key={v.id}
              onClick={() => toggleVendor(v.id)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] ${
                activeVendorIds.has(v.id)
                  ? "border-line-strong bg-page text-ink"
                  : "border-dashed border-line text-muted line-through"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${(VENDOR_ACCENT[v.id] ?? FALLBACK_ACCENT).dot}`}
              />
              {v.name}
            </button>
          ))}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-md border border-dashed border-line-strong bg-page px-2.5 py-1.5 text-[11px] text-ink"
          >
            <option value="All">All equipment types</option>
            {ALL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={monthsBack}
            onChange={(e) => setMonthsBack(Number(e.target.value))}
            className="rounded-md border border-dashed border-line-strong bg-page px-2.5 py-1.5 text-[11px] text-ink"
          >
            {MONTH_OPTIONS.map((m) => (
              <option key={m} value={m}>
                Last {m} months
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
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile
          label="DME spend to date"
          value={`$${Math.round(totalSpend).toLocaleString()}`}
          sub={category === "All" ? "cumulative, all orders" : `cumulative, ${category}`}
        />
        <StatTile
          label="Rx spend (monthly)"
          value={`$${Math.round(rxMonthly).toLocaleString()}`}
          sub={`census ${scopedPatients.length} · synthetic eRx feed`}
        />
        <StatTile
          label="Total cost of care (monthly)"
          value={`$${Math.round(dmeMonthly + rxMonthly).toLocaleString()}`}
          sub={`$${Math.round(dmeMonthly).toLocaleString()} DME · $${Math.round(rxMonthly).toLocaleString()} Rx`}
        />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile
          label="Cost per patient-day"
          value={costPerPatientDay !== null ? `$${costPerPatientDay.toFixed(2)}` : "—"}
          sub={`census ${scopedPatients.length}`}
        />
        <StatTile label="Avg days on DME" value={avgDaysOnDme.toFixed(0)} sub="per asset placed" />
        <StatTile
          label="Post-pickup idle days"
          value={idleDays.toFixed(0)}
          sub={idleCost > 0 ? `≈ $${idleCost.toLocaleString()} avoidable` : "none right now"}
          critical={idleDays > 0}
        />
      </div>

      <div className="mb-3.5 rounded-xl border border-line p-4">
        <div className="mb-0.5 text-xs font-semibold text-ink">Monthly DME spend by vendor</div>
        <div className="mb-2.5 text-[10px] text-muted">
          rent accrued per calendar month · hover a bar for the exact figure · detach to compare a
          different slice than the rest of the page
        </div>
        <ChartScope
          vendors={vendors}
          globalVendorIds={activeVendorIds}
          globalCategory={category}
          globalMonthsBack={monthsBack}
          includeMonths
        >
          {(scope) => {
            const chartMonths = lastNMonths(now, scope.monthsBack);
            const chartVendors = vendors.filter((v) => scope.vendorIds.has(v.id));
            const monthly = monthlyByVendor(monthlyRows, chartMonths, [...scope.vendorIds], scope.category);
            const maxMonthly = Math.max(
              1,
              ...monthly.flatMap((m) => chartVendors.map((v) => m.byVendor[v.id] ?? 0)),
            );
            if (chartVendors.length === 0)
              return <div className="py-6 text-center text-[11px] text-muted">No vendors selected.</div>;
            return (
              <>
                <div className="flex gap-4 overflow-x-auto pb-1">
                  {monthly.map(({ month, byVendor }) => (
                    <div key={month.key} className="flex min-w-[56px] flex-col items-center gap-1">
                      <div className="flex h-[160px] items-end gap-1">
                        {chartVendors.map((v) => {
                          const amt = byVendor[v.id] ?? 0;
                          return (
                            <div
                              key={v.id}
                              className="flex h-full w-3 flex-col items-center justify-end"
                            >
                              <div
                                className={`w-full rounded-t-[3px] ${(VENDOR_ACCENT[v.id] ?? FALLBACK_ACCENT).bar}`}
                                style={{
                                  height: `${Math.max((amt / maxMonthly) * 100, amt > 0 ? 2 : 0)}%`,
                                }}
                                title={`${v.name} · ${month.label} · $${Math.round(amt).toLocaleString()}`}
                              />
                            </div>
                          );
                        })}
                      </div>
                      <div className="text-[9px] text-muted">{month.label}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-3 border-t border-line pt-2.5">
                  {chartVendors.map((v) => (
                    <div key={v.id} className="flex items-center gap-1.5 text-[10px] text-ink-soft">
                      <span
                        className={`h-2 w-2 rounded-full ${(VENDOR_ACCENT[v.id] ?? FALLBACK_ACCENT).dot}`}
                      />
                      {v.name}
                    </div>
                  ))}
                </div>
              </>
            );
          }}
        </ChartScope>
      </div>

      <div className="mb-3.5 grid grid-cols-1 gap-3.5 lg:grid-cols-[1.25fr_1fr]">
        <div className="rounded-xl border border-line p-4">
          <div className="mb-3.5 flex items-baseline gap-2">
            <div className="text-xs font-semibold text-ink">DME cost by equipment category</div>
            <div className="text-[10px] text-muted">spend to date · unaffected by the type filter</div>
          </div>
          <div className="flex h-[150px] items-end gap-4 border-b border-line pb-0.5">
            {categories.map((c) => (
              <div key={c.category} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <div className="text-[9px] text-muted">${c.amount.toLocaleString()}</div>
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
          <div className="mb-2.5 text-[10px] text-muted">orders placed · spend to date</div>
          <ChartScope
            vendors={vendors}
            globalVendorIds={activeVendorIds}
            globalCategory={category}
            globalMonthsBack={monthsBack}
          >
            {(scope) => {
              const chartOrders = scopeOrders(allOrders, scope.vendorIds, scope.category);
              const topItems = topEquipment(chartOrders, now).slice(0, 6);
              const maxCount = Math.max(1, ...topItems.map((i) => i.count));
              if (topItems.length === 0)
                return (
                  <div className="py-6 text-center text-[11px] text-muted">
                    No orders match this filter.
                  </div>
                );
              return (
                <>
                  {topItems.map((i) => (
                    <div key={i.hcpcs} className="mb-2.5">
                      <div className="mb-1 flex items-baseline gap-2 text-[11px]">
                        <span className="font-mono text-[9.5px] text-muted">{i.hcpcs}</span>
                        <span className="flex-1 text-ink">{i.label}</span>
                        <span className="font-semibold text-ink">{i.count}</span>
                        <span className="min-w-[48px] text-right text-[10px] text-muted">
                          ${Math.round(i.spend).toLocaleString()}
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
                </>
              );
            }}
          </ChartScope>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.15fr_1fr]">
        <div className="rounded-xl border border-line p-4">
          <div className="mb-0.5 text-xs font-semibold text-ink">Length of use per patient</div>
          <div className="mb-2.5 text-[10px] text-muted">
            avg days placed, and the days sitting idle after pickup was due
          </div>
          <ChartScope
            vendors={vendors}
            globalVendorIds={activeVendorIds}
            globalCategory={category}
            globalMonthsBack={monthsBack}
          >
            {(scope) => {
              const chartOrders = scopeOrders(allOrders, scope.vendorIds, scope.category);
              const losRows = lengthOfUseRows(chartOrders, now);
              const maxAvgDays = Math.max(1, ...losRows.map((r) => r.avgDays));
              if (losRows.length === 0)
                return (
                  <div className="py-6 text-center text-[11px] text-muted">
                    Nothing delivered yet — length of use needs a delivery timestamp.
                  </div>
                );
              return (
                <>
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
                </>
              );
            }}
          </ChartScope>
        </div>

        <div className="flex flex-col gap-3.5">
          <div className="rounded-xl border border-line p-4">
            <div className="mb-0.5 text-xs font-semibold text-ink">Vendor performance</div>
            <div className="mb-3.5 text-[10px] text-muted">the numbers the order form ranks on</div>
            {vendorPerf.map(({ vendor, spend }) => (
              <div key={vendor.id} className="border-b border-line py-2.5 last:border-b-0">
                <div className="mb-1.5 flex items-baseline gap-2 text-[11px]">
                  <span
                    className={`h-2 w-2 rounded-full ${(VENDOR_ACCENT[vendor.id] ?? FALLBACK_ACCENT).dot}`}
                  />
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
              <div className="py-4 text-center text-[11px] text-muted">No vendor orders match this filter.</div>
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
