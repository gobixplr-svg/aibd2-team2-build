// ─────────────────────────────────────────────────────────────
// Stage 3 — Reason. The only AI in the risk path.
//
// This is the file the AI-ROI question gets answered from, so the
// constraints matter more than the cleverness:
//
//  · Features in, action choices out. The model receives computed
//    NUMBERS and returns a choice from a fixed enum. It never sees
//    raw order state and never emits one, so "it hallucinated a
//    delivery status" is impossible by construction rather than
//    discouraged by prompt wording. That's the brief's stated fear,
//    closed off architecturally.
//
//  · One call per tick, not per order. All interesting orders are
//    ranked together — cheaper, one round trip, and ranking is the
//    thing a threshold genuinely cannot do (which order do you fix
//    first when two are failing and you have one driver?).
//
//  · It cannot fail the demo. On timeout, error, refusal, or bad
//    output we fall back to the deterministic screen and keep going.
//    The rules-only path is always the floor.
//
//  · Every call is metered into the token ledger, so cost-per-order
//    is a measured number for Deliverable B rather than an estimate.
// ─────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import type {
  ActionTier,
  ReasonCode,
  RiskFeatures,
  TokenLedgerEntry,
} from "@/lib/contracts";

const MODEL = "claude-opus-5";

// Claude API list price, USD per million tokens.
const IN_PER_MTOK = 5;
const OUT_PER_MTOK = 25;
const CACHED_IN_PER_MTOK = 0.5; // cache reads ~0.1x input

// A heartbeat is background work, but on stage someone is watching a
// clock tick. Past this we take the deterministic answer and move on.
const TIMEOUT_MS = 10_000;

export const ACTIONS = [
  "reroute_vendor",
  "nudge_vendor",
  "escalate_case_manager",
  "notify_family",
  "schedule_pickup",
  "hold_and_watch",
] as const;
export type TriageAction = (typeof ACTIONS)[number];

// Which actions a human must confirm. Decided HERE, in code — not by
// the model. Asking the model to pick its own oversight level would
// defeat the point of having tiers.
const TIER_OF: Record<TriageAction, ActionTier> = {
  hold_and_watch: "reversible",
  nudge_vendor: "reversible",
  reroute_vendor: "consequential",
  escalate_case_manager: "consequential",
  schedule_pickup: "consequential",
  notify_family: "human_facing",
};

export interface TriagedAction {
  orderId: string;
  action: TriageAction;
  tier: ActionTier;
  rank: number;
  rationale: string;
  confidence: number;
}

export interface TriageOutcome {
  actions: TriagedAction[];
  aiUsed: boolean; // did we call the model on this beat?
  aiDerived?: boolean; // are these actions the model's, or the ladder's?
  fallbackReason?: string;
  ledger?: TokenLedgerEntry;
}

// ── Structured output schema ─────────────────────────────────
// Constrained hard: the model picks from enums. It cannot name an
// order that wasn't given to it, invent an action, or report a status.

const SCHEMA = {
  type: "object",
  properties: {
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          orderId: { type: "string" },
          action: { type: "string", enum: [...ACTIONS] },
          rank: { type: "integer" },
          rationale: {
            type: "string",
            description:
              "One sentence. Cite only the numeric feature values provided. Never state or imply a delivery status.",
          },
          confidence: { type: "number" },
        },
        required: ["orderId", "action", "rank", "rationale", "confidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["actions"],
  additionalProperties: false,
} as const;

const SYSTEM = `You are the triage stage of Hermes, the risk engine inside Handoff — a coordination layer between hospice agencies and durable medical equipment (DME) vendors.

You receive COMPUTED FEATURES for orders a deterministic screen has already flagged. You never receive raw order state, and you must never assert one.

Your job is to RANK and CHOOSE. Deciding *whether* something is late is arithmetic and already done. Deciding *what to do first*, when several orders are failing and a hospice has one on-call nurse and one backup vendor, is the judgment call.

Domain facts that should shape ranking:
- A missed discharge means a patient cannot safely go home. It is the sharpest failure in this domain.
- Oxygen is life-sustaining. Treat any delay on an oxygen order as a safety issue, not a service issue.
- After a death, the family is looking at their loved one's equipment until it is retrieved. The hospice also pays rent for every extra day. Overdue pickups are urgent and emotionally weighted.
- A vendor not connected to Handoff cannot be nudged in-app; reaching them means a phone call to a human.
- A vendor whose overall on-time rate looks healthy while its STAT rate degrades is a real signal worth acting on early.

Rules:
- Return one action per order given. Do not invent orders.
- rank 1 is the most urgent.
- rationale: ONE sentence, citing only the numeric values you were given. Never state a delivery status, a location, a capacity, or a patient detail.
- confidence: 0 to 1. Be honest. Below 0.7 means a human should look before acting.
- Prefer hold_and_watch when the numbers do not justify spending a human's attention.`;

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  // The SDK resolves ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an
  // `ant auth login` profile. Unset in local dev is fine — we fall back.
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return null;
  }
  if (!client) client = new Anthropic();
  return client;
}

/** Deterministic fallback — the rules-only baseline, always available. */
function fallback(
  inputs: { features: RiskFeatures; codes: ReasonCode[]; score: number }[],
  reason: string,
): TriageOutcome {
  const actions = [...inputs]
    .sort((a, b) => b.score - a.score)
    .map((i, idx) => {
      // Mirrors proposeAction()'s ladder so the two paths agree. Note
      // tick.ts only takes the ACTION from here when the model actually
      // ran — on the fallback path this contributes ranking only, and
      // proposeAction() stays authoritative.
      const c = i.codes;
      const action: TriageAction =
        c.includes("pickup_overdue_24h") || c.includes("pickup_family_notice")
          ? "notify_family"
          : c.includes("pickup_needs_backup") || c.includes("pickup_predicted_breach")
            ? "schedule_pickup"
            : c.includes("pickup_no_window") || c.includes("pickup_no_ack")
              ? "nudge_vendor"
              : c.includes("eta_past_deadline")
                ? "reroute_vendor"
                : c.includes("dispatch_silence")
                  ? i.features.vendorConnected
                    ? "nudge_vendor"
                    : "escalate_case_manager"
                  : "hold_and_watch";
      return {
        orderId: i.features.orderId,
        action,
        tier: TIER_OF[action],
        rank: idx + 1,
        rationale: `Rules-only: risk score ${i.score} from ${i.codes.join(", ")}.`,
        confidence: 1, // deterministic — no uncertainty to report
      };
    });
  return { actions, aiUsed: false, aiDerived: false, fallbackReason: reason };
}

/**
 * Rank and choose actions for the orders stage 2 found interesting.
 *
 * Never throws. Any failure returns the deterministic ranking, because
 * a heartbeat that dies on an API hiccup is worse than one that thinks
 * a little less well.
 */
export async function triage(
  inputs: { features: RiskFeatures; codes: ReasonCode[]; score: number }[],
  useAi: boolean,
): Promise<TriageOutcome> {
  // Stage 2 gates stage 3. No interesting orders → no call → zero cost.
  if (inputs.length === 0) return { actions: [], aiUsed: false, aiDerived: false };
  if (!useAi) return fallback(inputs, "rules_only_toggle");

  const anthropic = getClient();
  if (!anthropic) return fallback(inputs, "no_api_key");

  const payload = inputs.map((i) => ({
    ...i.features,
    reasonCodes: i.codes,
    deterministicScore: i.score,
  }));

  try {
    const res = await anthropic.messages.create(
      {
        model: MODEL,
        max_tokens: 2000,
        output_config: {
          // Low effort: this is ranking a handful of records against
          // stated rules, not open-ended reasoning. Keeps the tick fast
          // and the per-order cost honest.
          effort: "low",
          format: { type: "json_schema", schema: SCHEMA },
        },
        system: [
          {
            type: "text",
            text: SYSTEM,
            // Opus 5 caches from 512 tokens, so this prompt actually caches.
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: JSON.stringify(payload) }],
      },
      { timeout: TIMEOUT_MS },
    );

    // Safety classifiers can decline; check before reading content.
    if (res.stop_reason === "refusal") {
      return fallback(inputs, "refusal");
    }

    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") {
      return fallback(inputs, "no_text_block");
    }

    const parsed = JSON.parse(text.text) as { actions: TriagedAction[] };
    const known = new Set(inputs.map((i) => i.features.orderId));

    const actions = parsed.actions
      // Drop anything referencing an order we didn't send. The schema
      // makes this unlikely; the check makes it impossible.
      .filter((a) => known.has(a.orderId))
      .filter((a) => (ACTIONS as readonly string[]).includes(a.action))
      .map((a) => ({
        ...a,
        // Tier is ours, always. The model proposes; code decides how
        // much oversight the proposal needs.
        tier: TIER_OF[a.action],
      }));

    if (actions.length === 0) return fallback(inputs, "empty_after_validation");

    const u = res.usage;
    const cachedIn = u.cache_read_input_tokens ?? 0;
    const ledger: TokenLedgerEntry = {
      at: new Date().toISOString(),
      kind: "triage",
      orderCount: inputs.length,
      model: MODEL,
      inputTokens: u.input_tokens,
      outputTokens: u.output_tokens,
      cachedInputTokens: cachedIn,
      costUsd:
        (u.input_tokens / 1e6) * IN_PER_MTOK +
        (cachedIn / 1e6) * CACHED_IN_PER_MTOK +
        (u.output_tokens / 1e6) * OUT_PER_MTOK,
    };

    return { actions, aiUsed: true, aiDerived: true, ledger };
  } catch (err) {
    return fallback(
      inputs,
      err instanceof Error ? `error:${err.name}` : "error:unknown",
    );
  }
}
