// ─────────────────────────────────────────────────────────────
// DME equipment catalog — THE single rate table.
//
// Started by Dan for the order form; rates corrected by Will against
// prep/betterrx/cms-data-notes.md (CMS Medicare DME PUF, national,
// pulled Aug 12). Same exports and same shape — the order form is
// untouched — but the numbers are now the real ones.
//
// Why this file is the only rate table: the order form's cost
// estimate and the engine's pickup-overdue money counter both read
// it. Two tables meant the hospice board and /api/state could print
// different dollars for the same order, on stage, in front of judges
// who work in this domain.
//
// `monthly` = average Medicare payment per monthly rental claim.
// Core hospice DME is nearly all rental, which is exactly why a late
// pickup costs money: "if we don't pick it up then we have to pay for
// an additional day" — hospice COO, quoted in the brief.
// ─────────────────────────────────────────────────────────────

export interface CatalogItem {
  hcpcs: string;
  name: string;
  monthly: number; // avg Medicare payment per rental claim, CMS DME PUF
  highCost?: boolean; // routes to DON approval (a persona they named)
  oxygen?: boolean; // delay is a safety issue, not a service issue
  claimsPerYear?: number; // national volume — drives seed weighting
}

// Above this per-item monthly rate, the order needs the director of
// nursing to approve. $80 lands on the three genuinely expensive
// lines (pressure mattress, BiPAP, concentrator) and leaves routine
// beds, walkers and CPAP alone.
//
// Set against the real rates this is meaningful; against the earlier
// placeholder numbers it would have fired on CPAP, the most-fulfilled
// DME code in the country.
export const DON_THRESHOLD_MONTHLY = 80;

export const CATALOG: CatalogItem[] = [
  // Beds. E0260 is the semi-electric one and outnumbers E0250 roughly
  // 46:1 nationally — E0250 is fixed-height, and is kept only because
  // BetterRX's own sample orders use it.
  { hcpcs: "E0260", name: "Hospital bed, semi-electric", monthly: 49, claimsPerYear: 753_000 },
  { hcpcs: "E0250", name: "Hospital bed, fixed height", monthly: 47, claimsPerYear: 16_000 },

  // Respiratory. E1390 is the #1 DME code nationally by claim volume,
  // which matches the brief's own discharge scenario (bed + oxygen).
  { hcpcs: "E1390", name: "Oxygen concentrator", monthly: 85, oxygen: true, highCost: true, claimsPerYear: 5_470_000 },
  { hcpcs: "E0431", name: "Portable oxygen system", monthly: 17, oxygen: true, claimsPerYear: 2_230_000 },
  { hcpcs: "E0601", name: "CPAP device", monthly: 34, oxygen: true, claimsPerYear: 4_170_000 },
  { hcpcs: "E0470", name: "BiPAP respiratory assist", monthly: 91, oxygen: true, highCost: true, claimsPerYear: 535_000 },

  // Mobility.
  { hcpcs: "K0001", name: "Standard wheelchair", monthly: 19, claimsPerYear: 1_290_000 },
  { hcpcs: "E1130", name: "Standard wheelchair (detachable arms)", monthly: 19 },
  { hcpcs: "E0143", name: "Folding walker, wheeled", monthly: 49, claimsPerYear: 493_000 },

  // Comfort / skin integrity.
  { hcpcs: "E0163", name: "Commode chair", monthly: 52, claimsPerYear: 135_000 },
  { hcpcs: "E0277", name: "Powered pressure-reducing mattress", monthly: 162, highCost: true, claimsPerYear: 31_000 },
];

export const EQUIPMENT: Record<string, CatalogItem> = Object.fromEntries(
  CATALOG.map((c) => [c.hcpcs, c]),
);

/** Per-day rental cost — what one extra day of a late pickup costs. */
export const dailyRateUsd = (hcpcs: string) =>
  (EQUIPMENT[hcpcs]?.monthly ?? 40) / 30;

/** True when a delay is a patient-safety question rather than a service one. */
export const isOxygen = (hcpcs: string) => EQUIPMENT[hcpcs]?.oxygen === true;

/** Items on this order that need the director of nursing to sign off. */
export const donItems = (hcpcs: string[]) =>
  hcpcs
    .map((h) => EQUIPMENT[h])
    .filter((c): c is CatalogItem => Boolean(c))
    .filter((c) => c.highCost || c.monthly > DON_THRESHOLD_MONTHLY);
