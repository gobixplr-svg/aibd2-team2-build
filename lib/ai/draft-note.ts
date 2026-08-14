// ─────────────────────────────────────────────────────────────
// AI drafts — the words a human reviews before anyone reads them.
//
// Two drafters live here:
//   · draftStatusNoteAI  — first-pass note on an order status change
//   · draftFamilyMessage — the human_facing tier's payload: a message
//     to a grieving family that a PERSON sends, never Hermes alone
//
// Same constraints as triage.ts / extract-order.ts:
//   · Facts in, prose out. The model receives only the facts we hand
//     it (equipment names, window times, state labels) and is told a
//     wrong promise is worse than no promise. It never reads order
//     state from the store.
//   · It cannot fail the flow. Timeout / refusal / no key → the
//     template below, clearly labeled aiUsed:false.
//   · Metered into the token ledger (kinds: family_draft).
// ─────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import type { Order, OrderState, TokenLedgerEntry } from "@/lib/contracts";

const MODEL = "claude-opus-5";
const IN_PER_MTOK = 5;
const OUT_PER_MTOK = 25;
const CACHED_IN_PER_MTOK = 0.5;
const TIMEOUT_MS = 10_000;

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return null;
  }
  if (!client) client = new Anthropic();
  return client;
}

function ledgerFor(
  kind: TokenLedgerEntry["kind"],
  u: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null },
  orderId?: string,
): TokenLedgerEntry {
  const cachedIn = u.cache_read_input_tokens ?? 0;
  return {
    at: new Date().toISOString(),
    kind,
    orderId,
    model: MODEL,
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cachedInputTokens: cachedIn,
    costUsd:
      (u.input_tokens / 1e6) * IN_PER_MTOK +
      (cachedIn / 1e6) * CACHED_IN_PER_MTOK +
      (u.output_tokens / 1e6) * OUT_PER_MTOK,
  };
}

// ── Status notes ─────────────────────────────────────────────

// Template fallback — the original stub, kept verbatim as the floor.
// The board treats output as a draft the human edits before submit.
export function draftStatusNote(order: Order, to: OrderState): string {
  const items = order.items.map((i) => i.name.toLowerCase()).join(", ");
  switch (to) {
    case "dispatched":
      return `Order accepted by vendor for ${order.patientLabel} (${items}). ETA pending route assignment; deadline ${new Date(order.targetAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`;
    case "delivered":
      return `${items} delivered to ${order.patientLabel} at ${order.address}. POD and condition checklist on file from the vendor.`;
    case "pickup_triggered":
      return `Pickup requested for ${items} at ${order.patientLabel}'s residence. Family has been notified; retrieval due within 24 hours.`;
    default:
      return `Status updated to ${to.replace(/_/g, " ")} for ${order.patientLabel} (${items}).`;
  }
}

const NOTE_SYSTEM = `You write one-line chart notes for Handoff, a hospice DME coordination tool. A case manager reads them in a status feed and may edit before saving.

Rules:
- ONE sentence, maybe two. Factual, clinical-adjacent register, no warmth needed.
- Use ONLY the facts provided. Never invent a time, a person, or a condition.
- Never state anything about the patient's health.`;

export interface DraftResult {
  text: string;
  aiUsed: boolean;
  fallbackReason?: string;
  ledger?: TokenLedgerEntry;
}

/** Claude first-pass status note; template on any failure. Never throws. */
export async function draftStatusNoteAI(
  order: Order,
  to: OrderState,
): Promise<DraftResult> {
  const template = draftStatusNote(order, to);
  const anthropic = getClient();
  if (!anthropic) return { text: template, aiUsed: false, fallbackReason: "no_api_key" };
  try {
    const res = await anthropic.messages.create(
      {
        model: MODEL,
        max_tokens: 200,
        output_config: { effort: "low" },
        system: [{ type: "text", text: NOTE_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              transition: to,
              patientLabel: order.patientLabel,
              items: order.items.map((i) => i.name),
              targetAt: order.targetAt,
              urgency: order.urgency,
              pickupDueAt: order.pickup?.dueAt ?? null,
            }),
          },
        ],
      },
      { timeout: TIMEOUT_MS },
    );
    if (res.stop_reason === "refusal") {
      return { text: template, aiUsed: false, fallbackReason: "refusal" };
    }
    const block = res.content.find((b) => b.type === "text");
    const text = block && block.type === "text" ? block.text.trim() : "";
    if (!text) return { text: template, aiUsed: false, fallbackReason: "empty" };
    return {
      text,
      aiUsed: true,
      ledger: ledgerFor("status_note", res.usage, order.id),
    };
  } catch (err) {
    return {
      text: template,
      aiUsed: false,
      fallbackReason: err instanceof Error ? `error:${err.name}` : "error:unknown",
    };
  }
}

// ── Family messages ──────────────────────────────────────────
// The human_facing tier's whole point: Hermes prepares the words, a
// person reads, edits, and sends them. This function only prepares.

export interface FamilyMessageInput {
  patientLabel: string;
  kind: "pickup_update" | "pickup_heads_up" | "general_update";
  equipment: string[]; // display names in the home / on order
  // Only what we can honestly promise. null = no committed window, and
  // the model is told to say so rather than invent one.
  windowStart?: string | null;
  windowEnd?: string | null;
  orderId?: string;
}

const FAMILY_SYSTEM = `You draft short messages from a hospice care team to a patient's family, inside Handoff (hospice DME coordination). A nurse or case manager ALWAYS reviews and edits before sending — write a strong first draft, not a final word.

Context you must hold: if the message concerns equipment pickup, the patient has usually just died. The family is grieving, and the equipment in the home is a painful reminder.

Rules:
- 2 to 4 short sentences. Warm, plain, human. No corporate phrasing, no "we apologize for any inconvenience."
- Use ONLY the facts provided. If no retrieval window is given, do NOT invent or imply one — say the team is arranging it and will confirm a time.
- Never mention the patient's medical condition, cause of death, or anything clinical.
- Never name a vendor or company. It comes from "your care team."
- Do not use the word "died" or "passed" — the family knows; refer to "this time" or similar only if needed.
- No subject line, no signature block — just the message body. Sign-off "— your hospice care team" on its own line.`;

function familyTemplate(input: FamilyMessageInput): string {
  const eq = input.equipment.join(", ").toLowerCase() || "the equipment";
  const windowLine =
    input.windowStart && input.windowEnd
      ? `Our partner team is scheduled between ${new Date(input.windowStart).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} and ${new Date(input.windowEnd).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
      : `We are arranging the retrieval now and will confirm a time with you as soon as it is set.`;
  switch (input.kind) {
    case "pickup_update":
    case "pickup_heads_up":
      return `We wanted to reach out about ${eq} at the home. ${windowLine} Please don't hesitate to reach us with anything you need.\n— your hospice care team`;
    default:
      return `A quick update from your care team about ${eq}. ${windowLine} We're here if you have any questions.\n— your hospice care team`;
  }
}

/** Claude family-message draft; respectful template on any failure. Never throws. */
export async function draftFamilyMessage(
  input: FamilyMessageInput,
): Promise<DraftResult> {
  const template = familyTemplate(input);
  const anthropic = getClient();
  if (!anthropic) return { text: template, aiUsed: false, fallbackReason: "no_api_key" };
  try {
    const res = await anthropic.messages.create(
      {
        model: MODEL,
        max_tokens: 300,
        output_config: { effort: "low" },
        system: [{ type: "text", text: FAMILY_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: JSON.stringify(input) }],
      },
      { timeout: TIMEOUT_MS },
    );
    if (res.stop_reason === "refusal") {
      return { text: template, aiUsed: false, fallbackReason: "refusal" };
    }
    const block = res.content.find((b) => b.type === "text");
    const text = block && block.type === "text" ? block.text.trim() : "";
    if (!text) return { text: template, aiUsed: false, fallbackReason: "empty" };
    return {
      text,
      aiUsed: true,
      ledger: ledgerFor("family_draft", res.usage, input.orderId),
    };
  } catch (err) {
    return {
      text: template,
      aiUsed: false,
      fallbackReason: err instanceof Error ? `error:${err.name}` : "error:unknown",
    };
  }
}
