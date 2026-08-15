"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { Order, Patient, Vendor } from "@/lib/contracts";
import { ALL_CATEGORIES, CATALOG, categoryOf } from "@/lib/data/catalog";
import {
  daysOnRent,
  dmeMonthlyRunRate,
  dmeSpendFor,
  lastNMonths,
  lengthOfUseRows,
  type LengthOfUseRow,
  monthlyByVendor,
  monthlyDmeCost,
  ordersToCsv,
  patientDaysOnCensus,
  postPickupIdleCost,
  postPickupIdleDays,
  rxSpendMonthlyTotal,
  spendByVendorCategory,
  topEquipment,
  vendorPerformance,
} from "./derive";

// Vendor identity colors for the month-over-month charts — fixed by
// vendor id, never reassigned by filter/rank, so deselecting one vendor
// never repaints another's bars (dataviz rule: color follows the
// entity, not its rank). Teal + brand already pass the palette
// validator; a 3rd vendor needed a new hue — slate/navy both read as
// gray in a bar fill (chroma floor) — see globals.css's chart-blue.
const VENDOR_ACCENT: Record<string, { bar: string; dot: string; text: string }> = {
  v1: { bar: "bg-brand", dot: "bg-brand", text: "text-brand" },
  v2: { bar: "bg-chart-blue", dot: "bg-chart-blue", text: "text-chart-blue" },
  v3: { bar: "bg-teal", dot: "bg-teal", text: "text-teal" },
};
const FALLBACK_ACCENT = { bar: "bg-line-strong", dot: "bg-line-strong", text: "text-line-strong" };

const MONTH_OPTIONS = [3, 6, 12] as const;

interface ChartFilterScope {
  vendorIds: Set<string>;
  // null = every item. A real Set is always a strict subset — full
  // selection collapses back to null so a stale "11 of 11 selected"
  // label can never happen (see EquipmentTypeFilter).
  hcpcsIds: Set<string> | null;
  monthsBack: number;
}

function scopeOrders(orders: Order[], vendorIds: Set<string>, hcpcsIds: Set<string> | null): Order[] {
  return orders.filter((o) => {
    if (!vendorIds.has(o.vendorId)) return false;
    if (hcpcsIds === null) return true;
    return o.items.some((it) => hcpcsIds.has(it.hcpcs));
  });
}

// The equipment-type filter, one level more granular than the old
// category-only dropdown: pick specific catalog items (grouped by
// category, with a per-category select-all), not just a whole
// category at once — "Oxygen" used to bundle the $85/mo concentrator
// with the $17/mo portable system with no way to isolate one. A
// category checkbox is just "select every item under it," so the old
// category-level filtering still works, one click instead of several.
function EquipmentTypeFilter({
  value,
  onChange,
}: {
  value: Set<string> | null;
  onChange: (next: Set<string> | null) => void;
}) {
  const [open, setOpen] = useState(false);

  const byCategory = useMemo(() => {
    const groups = new Map<string, typeof CATALOG>();
    for (const item of CATALOG) {
      const cat = categoryOf(item.hcpcs);
      const list = groups.get(cat) ?? [];
      list.push(item);
      groups.set(cat, list);
    }
    return ALL_CATEGORIES.map((c) => [c, groups.get(c) ?? []] as const).filter(
      ([, items]) => items.length > 0,
    );
  }, []);

  const active = value ?? new Set(CATALOG.map((c) => c.hcpcs));
  const label =
    value === null ? "All equipment types" : `${value.size} item${value.size === 1 ? "" : "s"}`;

  function commit(next: Set<string>) {
    onChange(next.size === CATALOG.length ? null : next);
  }

  function toggleItem(hcpcs: string) {
    const next = new Set(active);
    if (next.has(hcpcs)) next.delete(hcpcs);
    else next.add(hcpcs);
    commit(next);
  }

  function toggleCategory(items: typeof CATALOG) {
    const allIn = items.every((i) => active.has(i.hcpcs));
    const next = new Set(active);
    for (const i of items) {
      if (allIn) next.delete(i.hcpcs);
      else next.add(i.hcpcs);
    }
    commit(next);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-dashed border-line-strong bg-page px-2.5 py-1.5 text-[11px] text-ink"
      >
        {label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[calc(100%+6px)] z-50 max-h-[340px] w-[260px] overflow-y-auto rounded-xl border border-line bg-surface p-3 shadow-2xl">
            <button
              onClick={() => onChange(null)}
              className={`mb-2.5 w-full rounded-md border px-2.5 py-1.5 text-left text-[11px] ${
                value === null ? "border-brand bg-brand/10 text-brand" : "border-line-strong text-ink-soft"
              }`}
            >
              All equipment types
            </button>
            {byCategory.map(([cat, items]) => {
              const allIn = items.every((i) => active.has(i.hcpcs));
              const someIn = items.some((i) => active.has(i.hcpcs));
              return (
                <div key={cat} className="mb-2.5 last:mb-0">
                  <label className="mb-1 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wide text-muted">
                    <input
                      type="checkbox"
                      checked={allIn}
                      ref={(el) => {
                        if (el) el.indeterminate = someIn && !allIn;
                      }}
                      onChange={() => toggleCategory(items)}
                    />
                    {cat}
                  </label>
                  {items.map((item) => (
                    <label
                      key={item.hcpcs}
                      className="flex items-center gap-1.5 py-0.5 pl-4 text-[10.5px] text-ink"
                    >
                      <input
                        type="checkbox"
                        checked={active.has(item.hcpcs)}
                        onChange={() => toggleItem(item.hcpcs)}
                      />
                      {item.name}
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
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
  globalHcpcsIds,
  globalMonthsBack,
  includeMonths,
  children,
}: {
  vendors: Vendor[];
  globalVendorIds: Set<string>;
  globalHcpcsIds: Set<string> | null;
  globalMonthsBack: number;
  includeMonths?: boolean;
  children: (scope: ChartFilterScope) => React.ReactNode;
}) {
  const [custom, setCustom] = useState<ChartFilterScope | null>(null);

  const effective: ChartFilterScope = custom ?? {
    vendorIds: globalVendorIds,
    hcpcsIds: globalHcpcsIds,
    monthsBack: globalMonthsBack,
  };

  function detach() {
    setCustom({
      vendorIds: new Set(globalVendorIds),
      hcpcsIds: globalHcpcsIds ? new Set(globalHcpcsIds) : null,
      monthsBack: globalMonthsBack,
    });
  }

  function toggleVendor(id: string) {
    setCustom((prev) => {
      const base = prev ?? {
        vendorIds: new Set(globalVendorIds),
        hcpcsIds: globalHcpcsIds ? new Set(globalHcpcsIds) : null,
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
            <EquipmentTypeFilter
              value={custom.hcpcsIds}
              onChange={(next) => setCustom((c) => (c ? { ...c, hcpcsIds: next } : c))}
            />
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

// Trend over time + tell distinct series apart → multi-line (dataviz
// skill's job→form table), not grouped bars — bars stop being readable
// past a handful of months, lines show direction at a glance. Hand-rolled
// SVG (no chart lib in this project): a 0–100 viewBox with
// preserveAspectRatio="none" so path coordinates double as CSS percent
// positions for the crosshair/tooltip/end-labels, all in one coordinate
// system.
function MonthlyTrendChart({
  months,
  vendors,
  monthly,
}: {
  months: { key: string; label: string }[];
  vendors: Vendor[];
  monthly: { month: { key: string; label: string }; byVendor: Record<string, number> }[];
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [tableView, setTableView] = useState(false);

  const n = months.length;
  const max = Math.max(1, ...monthly.flatMap((m) => vendors.map((v) => m.byVendor[v.id] ?? 0)));

  const xPct = (i: number) => (n > 1 ? (i / (n - 1)) * 100 : 50);
  const yPct = (amount: number) => 100 - (amount / max) * 100;

  const pathFor = (vendorId: string) =>
    monthly
      .map((m, i) => `${i === 0 ? "M" : "L"} ${xPct(i)} ${yPct(m.byVendor[vendorId] ?? 0)}`)
      .join(" ");

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const relX = (e.clientX - rect.left) / rect.width;
    setHoverIdx(Math.max(0, Math.min(n - 1, Math.round(relX * (n - 1)))));
  }

  // Direct-label the endpoint (≤3 series, comfortably direct-labelable
  // per the skill's series-count ladder) — nudge apart if two vendors'
  // final values land close enough to collide, rather than stacking.
  const last = monthly[monthly.length - 1];
  const endLabels = vendors
    .map((v) => ({ v, y: yPct(last?.byVendor[v.id] ?? 0), amount: last?.byVendor[v.id] ?? 0 }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < endLabels.length; i++) {
    if (endLabels[i].y - endLabels[i - 1].y < 11) endLabels[i].y = endLabels[i - 1].y + 11;
  }

  if (tableView) {
    return (
      <div>
        <button
          onClick={() => setTableView(false)}
          className="mb-2.5 text-[10px] font-medium text-secondary underline"
        >
          ← Back to chart
        </button>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-[10.5px]">
            <thead>
              <tr>
                <th className="border-b border-line py-1.5 pr-3 text-left text-muted">Vendor</th>
                {months.map((m) => (
                  <th key={m.key} className="border-b border-line px-2 py-1.5 text-right text-muted">
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.id}>
                  <td className="border-b border-line py-1.5 pr-3 text-ink">
                    <span
                      className={`mr-1.5 inline-block h-2 w-2 rounded-full ${(VENDOR_ACCENT[v.id] ?? FALLBACK_ACCENT).dot}`}
                    />
                    {v.name}
                  </td>
                  {monthly.map((m) => (
                    <td key={m.month.key} className="border-b border-line px-2 py-1.5 text-right text-ink-soft">
                      ${Math.round(m.byVendor[v.id] ?? 0).toLocaleString()}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="pr-20">
      <div className="mb-1.5 flex justify-end">
        <button
          onClick={() => setTableView(true)}
          className="text-[10px] text-ink-soft underline"
        >
          View as table
        </button>
      </div>
      <div
        className="relative"
        style={{ height: 180 }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <div className="absolute inset-0 flex flex-col justify-between">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="border-t border-line" />
          ))}
        </div>

        {/* Path geometry only — non-uniform x/y scaling from
            preserveAspectRatio="none" is fine for a line (every chart's
            x and y axes have independent scales), but it stretches
            FILLED shapes into ellipses, so the hover dots below are
            plain HTML circles instead, immune to the viewBox distortion. */}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
          {vendors.map((v) => (
            <path
              key={v.id}
              d={pathFor(v.id)}
              vectorEffect="non-scaling-stroke"
              fill="none"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              stroke="currentColor"
              className={(VENDOR_ACCENT[v.id] ?? FALLBACK_ACCENT).text}
            />
          ))}
        </svg>

        {hoverIdx !== null && (
          <div
            className="absolute top-0 bottom-0 w-px bg-line-strong"
            style={{ left: `${xPct(hoverIdx)}%` }}
          />
        )}

        {hoverIdx !== null &&
          vendors.map((v) => (
            <div
              key={v.id}
              className={`absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface ${(VENDOR_ACCENT[v.id] ?? FALLBACK_ACCENT).bar}`}
              style={{
                left: `${xPct(hoverIdx)}%`,
                top: `${yPct(monthly[hoverIdx]?.byVendor[v.id] ?? 0)}%`,
              }}
            />
          ))}

        {endLabels.map(({ v, y, amount }) => (
          <div
            key={v.id}
            className={`absolute whitespace-nowrap text-[9.5px] font-semibold ${(VENDOR_ACCENT[v.id] ?? FALLBACK_ACCENT).text}`}
            style={{ left: "100%", top: `${y}%`, marginLeft: 6, transform: "translateY(-50%)" }}
          >
            ${Math.round(amount).toLocaleString()}
          </div>
        ))}

        {hoverIdx !== null && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-md border border-line bg-surface px-2.5 py-2 text-[10px] shadow-lg"
            style={{ left: `${Math.max(10, Math.min(90, xPct(hoverIdx)))}%`, top: 0 }}
          >
            <div className="mb-1 font-semibold text-ink">{months[hoverIdx].label}</div>
            {vendors.map((v) => (
              <div key={v.id} className="flex items-center gap-1.5">
                <span className={`inline-block h-[2px] w-2.5 ${(VENDOR_ACCENT[v.id] ?? FALLBACK_ACCENT).dot}`} />
                <span className="font-semibold text-ink">
                  ${Math.round(monthly[hoverIdx].byVendor[v.id] ?? 0).toLocaleString()}
                </span>
                <span className="text-muted">{v.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="relative mt-1.5" style={{ height: 14 }}>
        {months.map((m, i) => (
          <div
            key={m.key}
            className="absolute -translate-x-1/2 whitespace-nowrap text-[9px] text-muted"
            style={{ left: `${xPct(i)}%` }}
          >
            {m.label}
          </div>
        ))}
      </div>

      <div className="mt-3.5 flex flex-wrap gap-3 border-t border-line pt-2.5">
        {vendors.map((v) => (
          <div key={v.id} className="flex items-center gap-1.5 text-[10px] text-ink-soft">
            <span className={`h-2 w-2 rounded-full ${(VENDOR_ACCENT[v.id] ?? FALLBACK_ACCENT).dot}`} />
            {v.name}
          </div>
        ))}
      </div>
    </div>
  );
}

// Magnitude across a grid (vendor × equipment type) is the heatmap's
// job per the dataviz skill's job→form table — a bar chart can only
// show one of those two dimensions at a time, which is exactly what
// this replaces (the old chart collapsed vendor entirely). Sequential
// ramp uses --brx-secondary (slate), not a vendor-identity hue — teal/
// brand/chart-blue are all already claimed as vendor colors elsewhere
// on this page, and reusing one here would read as "this cell is
// about that vendor," which isn't what a magnitude ramp means.
function SpendHeatmap({
  vendors,
  rows,
}: {
  vendors: Vendor[];
  rows: { vendorId: string; category: string; amount: number }[];
}) {
  const [tableView, setTableView] = useState(false);

  if (vendors.length === 0)
    return <div className="py-6 text-center text-[11px] text-muted">No vendors selected.</div>;

  const byKey = new Map(rows.map((r) => [`${r.vendorId}|${r.category}`, r.amount]));
  const max = Math.max(1, ...rows.map((r) => r.amount));

  if (tableView) {
    return (
      <div>
        <button
          onClick={() => setTableView(false)}
          className="mb-2.5 text-[10px] font-medium text-secondary underline"
        >
          ← Back to heatmap
        </button>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-[10.5px]">
            <thead>
              <tr>
                <th className="border-b border-line py-1.5 pr-3 text-left text-muted">Vendor</th>
                {ALL_CATEGORIES.map((c) => (
                  <th key={c} className="border-b border-line px-2 py-1.5 text-right text-muted">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.id}>
                  <td className="border-b border-line py-1.5 pr-3 text-ink">{v.name}</td>
                  {ALL_CATEGORIES.map((c) => (
                    <td key={c} className="border-b border-line px-2 py-1.5 text-right text-ink-soft">
                      ${(byKey.get(`${v.id}|${c}`) ?? 0).toLocaleString()}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[9px] text-muted">
          <span>Less</span>
          <span
            className="h-2 w-16 rounded-full"
            style={{
              background:
                "linear-gradient(to right, color-mix(in srgb, var(--brx-secondary) 6%, var(--brx-surface)), var(--brx-secondary))",
            }}
          />
          <span>More</span>
        </div>
        <button onClick={() => setTableView(true)} className="text-[10px] text-ink-soft underline">
          View as table
        </button>
      </div>
      <div className="overflow-x-auto">
        <div
          className="grid gap-[3px]"
          style={{ gridTemplateColumns: `112px repeat(${ALL_CATEGORIES.length}, minmax(48px, 1fr))` }}
        >
          <div />
          {ALL_CATEGORIES.map((c) => (
            <div key={c} className="pb-1.5 text-center text-[8.5px] uppercase tracking-wide text-muted">
              {c}
            </div>
          ))}
          {vendors.map((v) => (
            <Fragment key={v.id}>
              <div className="flex items-center pr-2 text-[9.5px] leading-tight text-ink-soft">{v.name}</div>
              {ALL_CATEGORIES.map((c) => {
                const amount = byKey.get(`${v.id}|${c}`) ?? 0;
                const pct = Math.round((amount / max) * 100);
                return (
                  <div
                    key={c}
                    title={`${v.name} · ${c} · $${amount.toLocaleString()}`}
                    className={`flex h-9 items-center justify-center rounded-[3px] text-[9px] font-medium ${
                      pct > 55 ? "text-white" : "text-ink"
                    }`}
                    style={{
                      background:
                        amount > 0
                          ? `color-mix(in srgb, var(--brx-secondary) ${Math.max(pct, 10)}%, var(--brx-surface))`
                          : "var(--brx-page)",
                    }}
                  >
                    {amount > 0 ? `$${amount >= 1000 ? `${(amount / 1000).toFixed(1)}k` : amount}` : "—"}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

// The relationship between two magnitudes (avg days placed, idle days
// after pickup) per equipment type is a scatter's job, not a table's —
// three parallel columns hide exactly the pattern that matters here
// ("this item combines a long placement AND a long idle wait"), which
// a dot's position surfaces at a glance. One series (equipment items),
// so no legend box is needed; dot size carries daily rate as a third
// variable without a second axis.
function LengthOfUseScatter({ rows }: { rows: LengthOfUseRow[] }) {
  const [tableView, setTableView] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  if (rows.length === 0)
    return (
      <div className="py-6 text-center text-[11px] text-muted">
        Nothing delivered yet — length of use needs a delivery timestamp.
      </div>
    );

  const maxAvg = Math.max(1, ...rows.map((r) => r.avgDays));
  const maxIdle = Math.max(1, ...rows.map((r) => r.idleDays));
  const maxRate = Math.max(1, ...rows.map((r) => r.dailyRate));

  const xPct = (avg: number) => 8 + (avg / maxAvg) * 82;
  const yPct = (idle: number) => 84 - (idle / maxIdle) * 74;
  const dotSize = (rate: number) => 12 + (rate / maxRate) * 20;

  if (tableView) {
    return (
      <div>
        <button
          onClick={() => setTableView(false)}
          className="mb-2.5 text-[10px] font-medium text-secondary underline"
        >
          ← Back to chart
        </button>
        <div className="grid grid-cols-[1.5fr_2fr_.6fr_.6fr] gap-2.5 border-b border-line pb-2 text-[9px] uppercase tracking-wide text-muted">
          <div>Item</div>
          <div>Avg days</div>
          <div className="text-right">Idle</div>
          <div className="text-right">Rate</div>
        </div>
        {rows.map((l) => (
          <div
            key={l.hcpcs}
            className="grid grid-cols-[1.5fr_2fr_.6fr_.6fr] items-center gap-2.5 border-b border-line py-2.5 text-[11px]"
          >
            <div>
              <div className="text-ink">{l.label}</div>
              <div className="font-mono text-[9px] text-muted">{l.hcpcs}</div>
            </div>
            <div className="text-ink">{l.avgDays.toFixed(0)}d</div>
            <div className="text-right text-critical">
              {l.idleDays > 0 ? `${l.idleDays.toFixed(0)}d` : "—"}
            </div>
            <div className="text-right text-ink-soft">${l.dailyRate.toFixed(2)}</div>
          </div>
        ))}
      </div>
    );
  }

  const hoveredRow = rows.find((r) => r.hcpcs === hovered);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[9px] text-muted">
        <span>dot size = daily rental rate</span>
        <button onClick={() => setTableView(true)} className="text-[10px] text-ink-soft underline">
          View as table
        </button>
      </div>
      <div className="relative" style={{ height: 210 }}>
        <div className="absolute inset-0 flex flex-col justify-between">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="border-t border-line" />
          ))}
        </div>
        {rows.map((r) => {
          const d = dotSize(r.dailyRate);
          const hit = Math.max(d, 24);
          return (
            <button
              key={r.hcpcs}
              onMouseEnter={() => setHovered(r.hcpcs)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(r.hcpcs)}
              onBlur={() => setHovered(null)}
              className="absolute flex items-center justify-center"
              style={{
                left: `${xPct(r.avgDays)}%`,
                top: `${yPct(r.idleDays)}%`,
                width: hit,
                height: hit,
                transform: "translate(-50%, -50%)",
              }}
            >
              <span
                className="rounded-full border-2 border-surface bg-secondary"
                style={{ width: d, height: d }}
              />
              <span className="absolute top-full mt-0.5 whitespace-nowrap font-mono text-[8px] text-muted">
                {r.hcpcs}
              </span>
            </button>
          );
        })}
        {hoveredRow && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+10px)] whitespace-nowrap rounded-md border border-line bg-surface px-2.5 py-2 text-[10px] shadow-lg"
            style={{ left: `${xPct(hoveredRow.avgDays)}%`, top: `${yPct(hoveredRow.idleDays)}%` }}
          >
            <div className="mb-1 font-semibold text-ink">{hoveredRow.label}</div>
            <div className="text-ink-soft">{hoveredRow.avgDays.toFixed(0)}d avg placement</div>
            <div className="text-ink-soft">
              {hoveredRow.idleDays > 0 ? `${hoveredRow.idleDays.toFixed(0)}d idle past pickup` : "no idle time"}
            </div>
            <div className="text-ink-soft">${hoveredRow.dailyRate.toFixed(2)}/day</div>
          </div>
        )}
      </div>
      <div className="mt-2 text-center text-[9px] text-muted">
        → avg days placed · ↑ idle days after pickup was due
      </div>
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
  patients,
  vendors,
  now,
}: {
  orders: Order[];
  patients: Patient[];
  vendors: Vendor[];
  now: number;
}) {
  const [vendorFilter, setVendorFilter] = useState<Set<string> | null>(null); // null = all
  const [hcpcsIds, setHcpcsIds] = useState<Set<string> | null>(null); // null = all equipment
  const [monthsBack, setMonthsBack] = useState<number>(6);

  // The year of ord-h history is immutable between resets, so it's
  // fetched ONCE when this tab mounts instead of riding the 2-second
  // board poll — that ride is what blew the Neon transfer quota.
  const [history, setHistory] = useState<Order[]>([]);
  useEffect(() => {
    let alive = true;
    fetch("/api/state?scope=history", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (alive && j.ok && Array.isArray(j.history)) setHistory(j.history);
      })
      .catch(() => {}); // charts render live-only until the fetch lands
    return () => {
      alive = false;
    };
  }, []);

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
    () => scopeOrders(vendorScoped, activeVendorIds, hcpcsIds),
    [vendorScoped, activeVendorIds, hcpcsIds],
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

  const vendorCategoryRows = useMemo(
    () => spendByVendorCategory(vendorScoped, now),
    [vendorScoped, now],
  );
  const visibleVendors = vendors.filter((v) => activeVendorIds.has(v.id));
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
          <EquipmentTypeFilter value={hcpcsIds} onChange={setHcpcsIds} />
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
          sub={
            hcpcsIds === null
              ? "cumulative, all orders"
              : `cumulative, ${hcpcsIds.size} item${hcpcsIds.size === 1 ? "" : "s"}`
          }
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
          rent accrued per calendar month · hover the chart for the exact figure · detach to
          compare a different slice than the rest of the page
        </div>
        <ChartScope
          vendors={vendors}
          globalVendorIds={activeVendorIds}
          globalHcpcsIds={hcpcsIds}
          globalMonthsBack={monthsBack}
          includeMonths
        >
          {(scope) => {
            const chartMonths = lastNMonths(now, scope.monthsBack);
            const chartVendors = vendors.filter((v) => scope.vendorIds.has(v.id));
            const monthly = monthlyByVendor(monthlyRows, chartMonths, [...scope.vendorIds], scope.hcpcsIds);
            if (chartVendors.length === 0)
              return <div className="py-6 text-center text-[11px] text-muted">No vendors selected.</div>;
            return <MonthlyTrendChart months={chartMonths} vendors={chartVendors} monthly={monthly} />;
          }}
        </ChartScope>
      </div>

      <div className="mb-3.5 grid grid-cols-1 gap-3.5 lg:grid-cols-[1.25fr_1fr]">
        <div className="rounded-xl border border-line p-4">
          <div className="mb-3.5 flex items-baseline gap-2">
            <div className="text-xs font-semibold text-ink">DME cost by vendor × equipment type</div>
            <div className="text-[10px] text-muted">spend to date · unaffected by the type filter</div>
          </div>
          <SpendHeatmap vendors={visibleVendors} rows={vendorCategoryRows} />
        </div>

        <div className="rounded-xl border border-line p-4">
          <div className="mb-0.5 text-xs font-semibold text-ink">Most-ordered equipment</div>
          <div className="mb-2.5 text-[10px] text-muted">orders placed · spend to date</div>
          <ChartScope
            vendors={vendors}
            globalVendorIds={activeVendorIds}
            globalHcpcsIds={hcpcsIds}
            globalMonthsBack={monthsBack}
          >
            {(scope) => {
              const chartOrders = scopeOrders(allOrders, scope.vendorIds, scope.hcpcsIds);
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
          <div className="mb-0.5 text-xs font-semibold text-ink">
            Length of use vs. idle time, by equipment
          </div>
          <div className="mb-2.5 text-[10px] text-muted">
            which items combine a long placement AND a long idle wait after pickup was due
          </div>
          <ChartScope
            vendors={vendors}
            globalVendorIds={activeVendorIds}
            globalHcpcsIds={hcpcsIds}
            globalMonthsBack={monthsBack}
          >
            {(scope) => {
              const chartOrders = scopeOrders(allOrders, scope.vendorIds, scope.hcpcsIds);
              const losRows = lengthOfUseRows(chartOrders, now);
              return <LengthOfUseScatter rows={losRows} />;
            }}
          </ChartScope>
        </div>

        <div className="flex flex-col gap-3.5">
          <div className="rounded-xl border border-line p-4">
            <div className="mb-0.5 text-xs font-semibold text-ink">Vendor performance</div>
            <div className="mb-2 text-[10px] text-muted">the numbers the order form ranks on</div>
            {vendorPerf.length > 0 && (
              <div className="mb-3 flex gap-3.5 text-[9.5px] text-ink-soft">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-teal" /> On-time
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-secondary" /> STAT on-time
                </span>
              </div>
            )}
            {vendorPerf.map(({ vendor, spend }) => {
              const onTime = Math.round((vendor.stats?.onTimeRate ?? 0) * 100);
              const stat = Math.round((vendor.stats?.statOnTimeRate ?? 0) * 100);
              return (
                <div key={vendor.id} className="border-b border-line py-2.5 last:border-b-0">
                  <div className="mb-1.5 flex items-baseline gap-2 text-[11px]">
                    <span
                      className={`h-2 w-2 rounded-full ${(VENDOR_ACCENT[vendor.id] ?? FALLBACK_ACCENT).dot}`}
                    />
                    <span className="flex-1 font-medium text-ink">{vendor.name}</span>
                    <span className="text-[10px] text-muted">${spend.toLocaleString()}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <div className="h-[7px] flex-1 rounded-sm bg-line">
                        <div className="h-[7px] rounded-sm bg-teal" style={{ width: `${onTime}%` }} />
                      </div>
                      <span className="min-w-[28px] text-right text-[9.5px] text-ink">{onTime}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-[7px] flex-1 rounded-sm bg-line">
                        <div className="h-[7px] rounded-sm bg-secondary" style={{ width: `${stat}%` }} />
                      </div>
                      <span className="min-w-[28px] text-right text-[9.5px] text-ink">{stat}%</span>
                    </div>
                  </div>
                  <div className="mt-1 text-[9px] text-muted">
                    avg pickup {vendor.stats?.avgPickupHours ?? "—"}h
                  </div>
                </div>
              );
            })}
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
