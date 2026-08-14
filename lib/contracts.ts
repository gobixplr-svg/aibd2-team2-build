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
  // Set by the vendor. Silence on either is an early signal in its own
  // right — the ladder fires on the ABSENCE of these, not on lateness.
  acknowledgedAt?: string; // dispatcher saw it
  windowStart?: string; // committed 2-hour retrieval window
  windowEnd?: string;
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

// ─────────────────────────────────────────────────────────────
// ENGINE TYPES — added by Will 3:05. Everything below is consumed
// by lib/engine/ and surfaced through /api/state. Purely additive:
// nothing above this line changed, so board/vendor/family pages
// keep compiling untouched.
//
// Two notes for Dan + Garrett:
//  · `at_risk` stays a STATE (your board columns are right). The
//    engine ALSO writes `order.risk` — so a delivered order can
//    still carry the flag that fired on it. Render `risk` for the
//    why-panel; render `state` for the column.
//  · `order.outcome` is written once at terminal state. It's what
//    makes the calibration number real instead of asserted.
// ─────────────────────────────────────────────────────────────

// Stage 1 output. These are the ONLY values stage 3 (Claude) ever
// sees — computed numbers in, action choices out. The model never
// receives raw order state, so it cannot invent one.
export interface RiskFeatures {
  orderId: string;
  hoursToDeadline: number; // negative = deadline already passed
  etaDeltaMin: number | null; // ETA vs targetAt; + = late. null until accepted
  dispatchSilenceMin: number; // since last state change
  pickupAgeHours: number | null; // since pickup.triggeredAt; null if not triggered
  pickupOverdueHours: number; // hours past the 24h SLA; 0 if within
  vendorOnTimeRate: number; // 0–1, this vendor, all orders
  vendorStatOnTimeRate: number; // 0–1, this vendor, STAT only — where v2 finds the story
  vendorConnected: boolean; // gates in-app escalation vs phone script
  // Pickup prediction. avgPickupHours is this vendor's measured history;
  // predictedBreachHours is how far past the SLA that history puts them.
  // Positive at T+0 means we know it will be late before it is late.
  vendorAvgPickupHours: number;
  pickupPredictedBreachHours: number;
  pickupAcknowledged: boolean;
  pickupWindowCommitted: boolean;
  urgency: Urgency;
  itemCount: number;
  isOxygen: boolean; // E1390/E0431 — safety-relevant, not just late
}

// Deterministic reason codes. Stage 2 emits these; the calibration
// view scores precision per code. Strings in RiskFlag.reasons stay
// human-readable — these are the machine key.
export type ReasonCode =
  | "eta_past_deadline"
  | "eta_tight"
  | "dispatch_silence"
  | "pickup_overdue_24h"
  | "vendor_stat_degrading"
  | "unconnected_vendor_no_ack"
  // ── the pickup ladder ──
  // Firing only at 24h reports a breach; it doesn't prevent one. These
  // rungs fire earlier and mostly silently, so the nurse hears about a
  // pickup only when it actually needs her.
  | "pickup_predicted_breach" // T+0, from vendor history — before anything is late
  | "pickup_no_ack" // T+2h  — vendor hasn't acknowledged
  | "pickup_no_window" // T+6h  — no 2-hour window committed
  | "pickup_needs_backup" // T+12h — propose reassignment
  | "pickup_family_notice"; // T+18h — predicted breach, draft the message

export interface ScreenResult {
  order: Order;
  features: RiskFeatures;
  reasonCodes: ReasonCode[];
  score: number; // 0–100, deterministic
}

// ── Tiered autonomy ──────────────────────────────────────────
// The brief requires us to show "where a person has to confirm
// before a high-stakes action happens." This is that, structurally.
export type ActionTier =
  | "reversible" // Hermes acts alone, logged
  | "consequential" // prepares + one-click human approve
  | "human_facing"; // never alone — family messages, patient status

export type InboxStatus = "pending" | "approved" | "rejected" | "auto_executed";

export interface InboxItem {
  id: string;
  createdAt: string; // ISO — engine time, not wall clock
  tier: ActionTier;
  orderId?: string;
  patientId?: string;
  title: string; // "Reroute DME-10305 to Great Basin"
  detail: string; // one sentence a nurse can act on
  reasons: string[]; // verbatim from RiskFlag.reasons
  features?: RiskFeatures; // stored inputs = the audit trail
  reasonCodes: ReasonCode[];
  proposedAction: string; // machine key, e.g. "reroute_vendor"
  status: InboxStatus;
  resolvedAt?: string;
  resolvedBy?: string;
  source: "hermes" | "don_approval" | "family_message";
  // True when Hermes handled it without anyone needing to know. The
  // measure of a good night shift is an empty inbox in the morning —
  // so the board should collapse these, not list them.
  silent?: boolean;
  draft?: string; // Claude-drafted family message, awaiting human send
}

// ── Policy ───────────────────────────────────────────────────
// Thresholds live in data, not constants, so the tuner can move
// them from measured outcomes. Every value here is a STATED
// ASSUMPTION — the FAQ blessed these numbers explicitly.
export interface Policy {
  statSlaHours: number; // same-day for STAT (FAQ)
  routineSlaHours: number; // 24h routine (FAQ)
  pickupSlaHours: number; // 24h post-death — hospice pays until retrieval
  etaTightMin: number; // ETA within this margin of deadline = warn
  dispatchSilenceMin: number; // no movement this long = silence flag
  vendorStatRateFloor: number; // below this STAT on-time rate = degrading
  useAiTriage: boolean; // the rules-only toggle, flipped live on stage
  // Pickup escalation ladder, in hours since the nurse triggered it.
  // Four of the rungs resolve without anyone being told.
  pickupAckHours: number; // no dispatcher acknowledgment
  pickupWindowHours: number; // no committed retrieval window
  pickupBackupHours: number; // propose reassignment
  pickupFamilyHours: number; // draft the family message
}

export const DEFAULT_POLICY: Policy = {
  statSlaHours: 8,
  routineSlaHours: 24,
  pickupSlaHours: 24,
  etaTightMin: 30,
  dispatchSilenceMin: 90,
  vendorStatRateFloor: 0.85,
  useAiTriage: true,
  pickupAckHours: 2,
  pickupWindowHours: 6,
  pickupBackupHours: 12,
  pickupFamilyHours: 18,
};

// ── The clock ────────────────────────────────────────────────
// tick(now) takes time as a parameter and NEVER reads the clock
// itself. This row is what the demo speed control writes to, and
// what makes 48 hours of aging showable at 2:15 PM Saturday.
export interface WorldClock {
  offsetMs: number; // added to real time
  speed: number; // 1 = real time; 60 = a minute per second
  anchorRealMs: number; // real epoch ms when speed was last set
  anchorVirtualMs: number; // virtual epoch ms at that moment
}

export interface World {
  clock: WorldClock;
  policy: Policy;
  lastTickAt?: string;
}

// ── Outcome + calibration ────────────────────────────────────
// Written once when an order reaches a terminal state. This is the
// honest version of "self-improving": we measure whether the flag
// was right, per reason code. No training, no manufactured precision.
export interface Outcome {
  orderId: string;
  wasFlagged: boolean;
  reasonCodes: ReasonCode[];
  actuallyLate: boolean;
  minutesLate: number; // negative = early
  recordedAt: string;
}

export interface Calibration {
  reasonCode: ReasonCode;
  flagged: number;
  trueP: number;
  falseP: number;
  missed: number;
  precision: number; // trueP / (trueP + falseP)
  recall: number; // trueP / (trueP + missed)
}

// ── Inbound family messages (Sat) ────────────────────────────
// The one place rules genuinely cannot go: free text. Claude
// classifies; it never sends, never mutates order state.
export type MessageCategory =
  | "equipment_broken"
  | "equipment_not_working"
  | "pickup_request"
  | "delivery_question"
  | "distress"
  | "other";

export interface InboundMessage {
  id: string;
  patientId: string;
  body: string;
  receivedAt: string;
  triage?: MessageTriage;
}

export interface MessageTriage {
  category: MessageCategory;
  urgency: "immediate" | "same_day" | "routine";
  safetyFlag: boolean; // oxygen/bed failure — safety, not just service
  recommendedAction: string;
  reasonCodes: string[];
  confidence: number; // < 0.7 escalates to a human instead of asserting
}

// ── Token accounting ─────────────────────────────────────────
// Deliverable B asks for cost per order. Because stage 2 gates
// stage 3, a tick that finds nothing costs exactly zero — so this
// is a measured number, not an estimate.
export interface TokenLedgerEntry {
  at: string;
  kind: "triage" | "family_draft" | "message_triage";
  orderId?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  costUsd: number;
}
