// ─────────────────────────────────────────────────────────────
// THE shared contract. Drafted by Dan at 2:50 to unblock the
// vendor lane — WILL OWNS THIS FILE from here. Shape follows
// docs/lane-cards.md. Changes require a shout to all three.
// ─────────────────────────────────────────────────────────────

export type OrderState =
  | "ordered"
  | "dispatched"
  | "in_transit"
  | "at_risk"
  | "delivered"
  | "pickup_triggered"
  | "pickup_delayed";

export type Urgency = "stat" | "routine";

export interface OrderItem {
  hcpcs: string;
  name: string;
  assetId?: string;
}

export interface RiskFlag {
  score: number; // 0–100
  reasons: string[]; // legible "why", rendered verbatim in the UI
  features: Record<string, number | string | boolean>; // stored inputs — the audit trail
  flaggedAt: string; // ISO
}

export interface ConditionCheck {
  clean: boolean;
  functional: boolean;
  complete: boolean;
  note?: string;
}

export interface ProofOfDelivery {
  photoUrl?: string;
  signedBy?: string;
  at: string; // ISO
  condition: ConditionCheck;
}

export interface Pickup {
  triggeredAt: string; // ISO
  triggeredBy: "nurse" | "emr"; // nurse-initiated primary, EMR fallback
  dueAt: string; // ISO — triggeredAt + 24h (deep dive: hospice pays until retrieval)
  completedAt?: string;
  condition?: ConditionCheck; // condition-on-return
}

export interface Order {
  id: string;
  patientId: string;
  patientLabel: string; // synthetic display name only — never real PHI
  address: string;
  items: OrderItem[];
  urgency: Urgency;
  vendorId: string;
  targetAt: string; // ISO — discharge deadline / delivery window end
  state: OrderState;
  etaAt?: string; // ISO — set by dispatcher on accept
  risk?: RiskFlag;
  pod?: ProofOfDelivery;
  pickup?: Pickup;
  note?: string;
  timestamps: Partial<Record<OrderState, string>>; // state → ISO, written by transition()
}

export interface Vendor {
  id: string;
  token: string; // magic-link token for /v/[token]
  name: string;
  connected: boolean; // false = Handoff tracks it, escalations go to case manager
  serviceArea?: string;
  stats?: {
    onTimeRate: number;
    statOnTimeRate: number;
    avgPickupHours: number;
    podCompleteness: number;
  };
}

export interface Patient {
  id: string;
  label: string;
  familyToken?: string; // magic-link token for /f/[token]
  status: "active" | "discharged" | "deceased";
}

// eRx-shaped event (mirrors the FAQ payload pattern: meta.eventType + payload)
export interface HandoffEvent {
  meta: { eventType: string; at: string };
  account: { identifiers: { id: string }[] };
  payload: Record<string, unknown>;
}

// Legal state transitions — transition() (Will's) is the ONLY writer of state.
export const TRANSITIONS: Record<OrderState, OrderState[]> = {
  ordered: ["dispatched"],
  dispatched: ["in_transit", "at_risk"],
  in_transit: ["at_risk", "delivered"],
  at_risk: ["in_transit", "delivered"],
  delivered: ["pickup_triggered"],
  pickup_triggered: ["pickup_delayed"],
  pickup_delayed: [],
};
