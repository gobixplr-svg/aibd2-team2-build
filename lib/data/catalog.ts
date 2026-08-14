// DME equipment catalog for the order form — common hospice HCPCS E-codes
// with rough monthly rental costs (CMS-flavored, synthetic; cited as
// assumptions in the pitch). highCost items route to DON approval.

export interface CatalogItem {
  hcpcs: string;
  name: string;
  monthly: number; // est. rental $/mo
  highCost?: boolean;
}

export const CATALOG: CatalogItem[] = [
  { hcpcs: "E0250", name: "Hospital bed, semi-electric", monthly: 49 },
  { hcpcs: "E1390", name: "Oxygen concentrator", monthly: 45 },
  { hcpcs: "E0431", name: "Portable oxygen system", monthly: 38 },
  { hcpcs: "E0601", name: "CPAP device", monthly: 55, highCost: true },
  { hcpcs: "E1130", name: "Standard wheelchair", monthly: 30 },
  { hcpcs: "E0143", name: "Folding walker", monthly: 12 },
  { hcpcs: "E0163", name: "Bedside commode", monthly: 15 },
  { hcpcs: "E0277", name: "Low-air-loss mattress", monthly: 68, highCost: true },
];

export const DON_THRESHOLD_MONTHLY = 50; // above this per-item $/mo → DON approval
