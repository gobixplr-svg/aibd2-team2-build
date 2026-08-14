// ─────────────────────────────────────────────────────────────
// Inbound family message triage. Owned by Will (engine lane).
//
// This is the one place in the product where rules genuinely cannot
// go, and it's the strongest answer to the brief's AI-ROI question.
//
// Everything else Hermes does is arithmetic: ETA vs deadline, 24h
// aging, on-time rates. We chose rules there deliberately and say so.
// But a family texts:
//
//   "the oxygen thing is making a weird noise and she says she cant
//    breathe right"
//
// and no threshold parses that. Keyword-matching "oxygen" would also
// fire on "is someone picking up the oxygen tank tomorrow?" — same
// word, opposite urgency. That's the brief's own criterion for when
// AI wins: "Pattern complexity. The signal isn't a clean threshold."
//
// Constraints, identical in spirit to stage 3:
//  · The classifier ONLY classifies. It never sends a reply, never
//    changes order state, never touches patient status.
//  · Output is enum-constrained. It cannot invent an action.
//  · Tier is decided in code from the action, never by the model.
//  · Confidence below 0.7 routes to a human rather than asserting.
//  · On any failure it degrades to a keyword heuristic that is
//    deliberately pessimistic — flags for a human rather than
//    quietly resolving something it doesn't understand.
// ─────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import type {
  ActionTier,
  MessageAction,
  MessageTriage,
  Order,
  TokenLedgerEntry,
} from "@/lib/contracts";
import { isRespiratory } from "@/lib/data/catalog";

const MODEL = "claude-opus-5";
const IN_PER_MTOK = 5;
const OUT_PER_MTOK = 25;
const CACHED_IN_PER_MTOK = 0.5;

// A family is waiting on the other end of this. Shorter than the tick's
// budget — if we can't classify quickly, a human should just read it.
const TIMEOUT_MS = 8_000;

export const MESSAGE_ACTIONS: MessageAction[] = [
  "dispatch_replacement",
  "escalate_on_call_nurse",
  "expedite_pickup",
  "answer_from_status",
  "reply_needs_human",
];

// Oversight level per action — in code, not the model's choice.
// Anything the family reads back is human_facing without exception.
const TIER_OF: Record<MessageAction, ActionTier> = {
  answer_from_status: "reversible",
  dispatch_replacement: "consequential",
  expedite_pickup: "consequential",
  escalate_on_call_nurse: "consequential",
  reply_needs_human: "human_facing",
};

export const tierForMessageAction = (a: MessageAction): ActionTier =>
  TIER_OF[a] ?? "human_facing";

const SCHEMA = {
  type: "object",
  properties: {
    category: {
      type: "string",
      enum: [
        "equipment_broken",
        "equipment_not_working",
        "pickup_request",
        "delivery_question",
        "distress",
        "other",
      ],
    },
    urgency: { type: "string", enum: ["immediate", "same_day", "routine"] },
    safetyFlag: {
      type: "boolean",
      description:
        "True only when failure of life-sustaining equipment (oxygen, CPAP/BiPAP) or a physical injury risk is described.",
    },
    recommendedAction: { type: "string", enum: [...MESSAGE_ACTIONS] },
    rationale: {
      type: "string",
      description:
        "One sentence quoting or paraphrasing what the family actually wrote. Never state a delivery status or a fact you were not given.",
    },
    reasonCodes: { type: "array", items: { type: "string" } },
    confidence: { type: "number" },
  },
  required: [
    "category",
    "urgency",
    "safetyFlag",
    "recommendedAction",
    "rationale",
    "reasonCodes",
    "confidence",
  ],
  additionalProperties: false,
} as const;

const SYSTEM = `You triage inbound text messages from hospice patients' families for Handoff, a coordination layer between hospice agencies and durable medical equipment (DME) vendors.

A family member has texted the hospice about equipment in their home. Classify the message. You do NOT reply to them and you do NOT take any action — a human does that. Your job is to decide how urgent this is and what should happen next.

Context you receive is limited to: the equipment currently in that home, and whether a retrieval is already scheduled. Treat anything outside that as unknown. Never state or imply a delivery status, an ETA, a vendor's whereabouts, or any clinical fact you were not given.

Weighting this domain requires:
- Oxygen concentrators, portable oxygen, CPAP and BiPAP are life-sustaining. A described failure is a SAFETY issue, immediate, regardless of how calmly it is worded. Families understate.
- Physical injury risk — a protruding screw, a broken rail, a chair that collapses — is also safety, even on non-clinical equipment.
- Soiled or contaminated equipment is urgent and dignity-related, not merely a service complaint.
- After a death, equipment still in the home is distressing. Treat requests to remove it as time-sensitive and emotionally weighted, never as routine admin.
- A question you can answer from the context given (a retrieval already scheduled, equipment already known) is answer_from_status. Do not escalate what is merely a question.
- Grief, panic, or anger in the wording raises urgency even when the equipment issue itself is minor.

Choosing the action:
- dispatch_replacement — the equipment itself is broken, unsafe, or unusable and the family needs a working one. This is the right call for a protruding screw, a collapsed rail, a soiled chair, a concentrator that has stopped. Choose it even when a nurse should also be told; escalate_on_call_nurse is for when a PERSON is needed, not a replacement unit.
- escalate_on_call_nurse — someone needs a clinician now: breathing difficulty, injury, acute distress, or anything where the family is frightened.
- expedite_pickup — they want equipment gone sooner than scheduled.
- answer_from_status — the context you were given already answers them. Only when it genuinely does.
- reply_needs_human — a person should word the response themselves. Condolences, thanks, complaints, and anything ambiguous.

Both a replacement AND a nurse are often warranted. Pick the one that unblocks the family fastest, and say in the rationale that the other is also needed.

confidence: 0 to 1, honest, about your READING of the message — not about whether a human should also see it (tiering handles that separately). A short, plain message whose meaning is obvious deserves high confidence even if the right response is "a person should reply." Reserve low confidence for wording you genuinely cannot interpret. Use it freely when that happens — a person reading one extra message costs far less than a missed safety issue.`;

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return null;
  }
  if (!client) client = new Anthropic();
  return client;
}

/**
 * Keyword fallback. Deliberately pessimistic: it escalates rather than
 * resolves, and never claims confidence it hasn't earned.
 *
 * This exists so the product degrades honestly, and so we can show the
 * rules-only baseline side by side — it is visibly worse at exactly the
 * job the model is good at, which is the comparison the brief asks for.
 */
export function fallbackTriage(body: string): MessageTriage {
  const t = body.toLowerCase();
  const broken = /(broke|broken|crack|screw|sharp|wobbl|collaps|rip|tear|stuck)/.test(t);
  const filthy = /(dirty|filth|soil|stain|smell|fecal|urine|blood)/.test(t);
  const respiratory = /(oxygen|o2|concentrator|cpap|bipap|breath|air)/.test(t);
  const pickup = /(pick ?up|collect|remove|take (it|them) (back|away)|still here)/.test(t);

  const safetyFlag = respiratory || broken;
  const action: MessageAction = safetyFlag
    ? "escalate_on_call_nurse"
    : pickup
      ? "expedite_pickup"
      : "reply_needs_human";

  return {
    category: broken
      ? "equipment_broken"
      : filthy
        ? "equipment_broken"
        : pickup
          ? "pickup_request"
          : "other",
    urgency: safetyFlag ? "immediate" : pickup ? "same_day" : "routine",
    safetyFlag,
    recommendedAction: action,
    rationale:
      "Keyword match only — no model available. Routed to a human because " +
      "the wording was not actually understood.",
    reasonCodes: ["keyword_fallback"],
    // Never above the human-review threshold. A keyword hit is not
    // comprehension, and presenting it as certainty is the failure mode
    // the brief warns about.
    confidence: 0.4,
    aiUsed: false,
  };
}

export interface MessageContext {
  patientLabel: string;
  equipment: string[];
  respiratoryInHome: boolean;
  pickupScheduled: boolean;
  pickupWindow?: string;
}

/** Build grounding context from orders — computed facts only. */
export function contextFor(
  patientLabel: string,
  orders: Order[],
): MessageContext {
  const items = orders.flatMap((o) => o.items);
  const pickup = orders.find((o) => o.pickup && !o.pickup.completedAt)?.pickup;
  return {
    patientLabel,
    equipment: [...new Set(items.map((i) => i.name))],
    respiratoryInHome: items.some((i) => isRespiratory(i.hcpcs)),
    pickupScheduled: Boolean(pickup?.windowStart),
    pickupWindow:
      pickup?.windowStart && pickup?.windowEnd
        ? `${pickup.windowStart} to ${pickup.windowEnd}`
        : undefined,
  };
}

export interface MessageTriageResult {
  triage: MessageTriage;
  ledger?: TokenLedgerEntry;
}

/**
 * Classify one inbound family message. Never throws.
 */
export async function triageMessage(
  body: string,
  ctx: MessageContext,
  useAi: boolean,
): Promise<MessageTriageResult> {
  if (!useAi) return { triage: fallbackTriage(body) };

  const anthropic = getClient();
  if (!anthropic) return { triage: fallbackTriage(body) };

  try {
    const res = await anthropic.messages.create(
      {
        model: MODEL,
        max_tokens: 1000,
        output_config: {
          effort: "low",
          format: { type: "json_schema", schema: SCHEMA },
        },
        system: [
          { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
        ],
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              context: ctx,
              message: body,
            }),
          },
        ],
      },
      { timeout: TIMEOUT_MS },
    );

    if (res.stop_reason === "refusal") return { triage: fallbackTriage(body) };

    const block = res.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return { triage: fallbackTriage(body) };

    const parsed = JSON.parse(block.text) as MessageTriage;

    // Validate the action even though the schema constrains it — a bad
    // action would silently grant the wrong oversight tier.
    if (!MESSAGE_ACTIONS.includes(parsed.recommendedAction)) {
      return { triage: fallbackTriage(body) };
    }

    const u = res.usage;
    const cachedIn = u.cache_read_input_tokens ?? 0;

    return {
      triage: { ...parsed, aiUsed: true },
      ledger: {
        at: new Date().toISOString(),
        kind: "message_triage",
        orderCount: 1,
        model: MODEL,
        inputTokens: u.input_tokens,
        outputTokens: u.output_tokens,
        cachedInputTokens: cachedIn,
        costUsd:
          (u.input_tokens / 1e6) * IN_PER_MTOK +
          (cachedIn / 1e6) * CACHED_IN_PER_MTOK +
          (u.output_tokens / 1e6) * OUT_PER_MTOK,
      },
    };
  } catch {
    return { triage: fallbackTriage(body) };
  }
}
