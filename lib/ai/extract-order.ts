// ─────────────────────────────────────────────────────────────
// AI order intake — paste a referral, get a DRAFT order.
//
// Same constraints as triage.ts, because they answer the same judge
// question ("what happens when the AI is wrong?"):
//
//  · Free text in, enum choices out. Items come from the HCPCS
//    catalog, the patient from the census we pass in — the model
//    cannot invent an equipment code or a patient.
//
//  · Per-field confidence. The UI renders it verbatim and a human
//    confirms every field before the order exists. Extraction never
//    writes to the store; POST /api/orders still does that, from the
//    same modal, after review.
//
//  · It cannot fail the flow. Timeout, refusal, no key, bad output →
//    keyword fallback, clearly labeled aiUsed:false and never
//    presented as confident.
//
//  · Metered into the token ledger like every other Claude call.
// ─────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import type { TokenLedgerEntry, Urgency } from "@/lib/contracts";
import { CATALOG } from "@/lib/data/catalog";

const MODEL = "claude-opus-5";

// Claude API list price, USD per million tokens (matches triage.ts).
const IN_PER_MTOK = 5;
const OUT_PER_MTOK = 25;
const CACHED_IN_PER_MTOK = 0.5;

// A nurse is watching a modal spinner, not a background heartbeat.
const TIMEOUT_MS = 12_000;

export interface ExtractedField<T> {
  value: T;
  confidence: number; // 0–1, rendered verbatim in the UI
}

export interface ExtractedOrder {
  items: ExtractedField<string>[]; // HCPCS codes from the catalog
  urgency: ExtractedField<Urgency>;
  // Hours until the delivery deadline, relative to "now". Relative on
  // purpose: the demo clock runs fast, so the model never computes an
  // absolute date it could get wrong. null = referral didn't say.
  targetHoursFromNow: ExtractedField<number> | null;
  patientId: ExtractedField<string> | null; // from the census we passed in
  // What in the referral text did NOT map to anything — the honest
  // remainder a human should read before confirming.
  unmapped: string[];
  aiUsed: boolean;
  fallbackReason?: string;
  ledger?: TokenLedgerEntry;
}

// ── Structured output schema ─────────────────────────────────
// HCPCS codes and patient ids are enums built from live data, so the
// model picks — it cannot mint identifiers.

const HCPCS = CATALOG.map((c) => c.hcpcs);

function buildSchema(patientIds: string[]) {
  const field = (valueSchema: object) => ({
    type: "object",
    properties: {
      value: valueSchema,
      confidence: { type: "number" },
    },
    required: ["value", "confidence"],
    additionalProperties: false,
  });
  return {
    type: "object",
    properties: {
      items: { type: "array", items: field({ type: "string", enum: HCPCS }) },
      urgency: field({ type: "string", enum: ["stat", "routine"] }),
      targetHoursFromNow: {
        anyOf: [field({ type: "integer" }), { type: "null" }],
      },
      patientId: {
        anyOf: [
          field(
            patientIds.length
              ? { type: "string", enum: patientIds }
              : { type: "string" },
          ),
          { type: "null" },
        ],
      },
      unmapped: {
        type: "array",
        items: { type: "string" },
        description:
          "Verbatim phrases from the referral that requested equipment or constraints you could NOT map to the catalog or fields. Empty if everything mapped.",
      },
    },
    required: ["items", "urgency", "targetHoursFromNow", "patientId", "unmapped"],
    additionalProperties: false,
  } as const;
}

const SYSTEM = `You are the order-intake stage of Handoff, a coordination layer between hospice agencies and durable medical equipment (DME) vendors.

A nurse pastes a free-text referral (a discharge summary, a faxed order transcription, an email). You extract a DRAFT equipment order. A human reviews every field before anything is ordered — so be honest, not helpful: a wrong guess at high confidence costs more than a null.

Rules:
- items: only HCPCS codes from the provided enum. Map clinical language to the closest catalog item ("O2 at 2L" → oxygen concentrator; "bed with rails, adjustable head" → semi-electric hospital bed). If the referral names equipment the catalog does not carry, put the phrase in unmapped instead of forcing a bad match.
- urgency: "stat" only when the text says so or clearly implies same-day need (discharge today, actively dying, oxygen-dependent transport home). Otherwise "routine".
- targetHoursFromNow: hours from now until delivery is needed, if the text gives a deadline ("by 5pm today" when it is morning ≈ 6–8; "before discharge Thursday" — estimate). null when the text gives none. Never invent one.
- patientId: pick from the provided census (id + name pairs) only when the referral's patient name clearly matches one. null otherwise — never guess between similar names; say so with low confidence or null.
- confidence: 0 to 1, per field. Below 0.7 means the reviewing human should look closely. Be honest.
- unmapped: quote the referral verbatim. This is what the human reads to catch what you missed.`;

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return null;
  }
  if (!client) client = new Anthropic();
  return client;
}

// ── Keyword fallback ─────────────────────────────────────────
// The rules-only floor. Low confidence on purpose: it is a string
// match, and it says so.

const KEYWORDS: [RegExp, string][] = [
  [/hospital bed|hospice bed|semi.?electric|bed with rails/i, "E0260"],
  [/fixed.?height bed/i, "E0250"],
  [/oxygen concentrator|concentrator|o2 |oxygen at|liters?\b.*oxygen|oxygen/i, "E1390"],
  [/portable (oxygen|o2)|e.?tank|travel oxygen/i, "E0431"],
  [/cpap/i, "E0601"],
  [/bipap|bi.?level/i, "E0470"],
  [/wheelchair/i, "K0001"],
  [/walker|rollator/i, "E0143"],
  [/commode/i, "E0163"],
  [/pressure.?(reducing|relief)|air mattress|low.?air.?loss/i, "E0277"],
];

function fallback(
  text: string,
  patients: { id: string; label: string }[],
  reason: string,
): ExtractedOrder {
  const items = [
    ...new Set(KEYWORDS.filter(([re]) => re.test(text)).map(([, h]) => h)),
  ].map((hcpcs) => ({ value: hcpcs, confidence: 0.5 }));
  const stat = /\bstat\b|urgent|asap|today|immediately|right away/i.test(text);
  const matched = patients.find((p) =>
    text.toLowerCase().includes(p.label.toLowerCase()),
  );
  return {
    items,
    urgency: { value: stat ? "stat" : "routine", confidence: stat ? 0.6 : 0.5 },
    targetHoursFromNow: null,
    patientId: matched ? { value: matched.id, confidence: 0.6 } : null,
    unmapped: [],
    aiUsed: false,
    fallbackReason: reason,
  };
}

/**
 * Extract a draft order from pasted referral text.
 *
 * Never throws. Any failure returns the keyword fallback — a worse
 * draft the human corrects beats a modal that errors out.
 */
export async function extractOrder(
  text: string,
  patients: { id: string; label: string }[],
): Promise<ExtractedOrder> {
  const anthropic = getClient();
  if (!anthropic) return fallback(text, patients, "no_api_key");

  const catalogForPrompt = CATALOG.map((c) => ({ hcpcs: c.hcpcs, name: c.name }));

  try {
    const res = await anthropic.messages.create(
      {
        model: MODEL,
        max_tokens: 1500,
        output_config: {
          // Mapping phrases onto a small catalog — not open-ended
          // reasoning. Low keeps the spinner short.
          effort: "low",
          format: { type: "json_schema", schema: buildSchema(patients.map((p) => p.id)) },
        },
        system: [
          {
            type: "text",
            text: SYSTEM,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              catalog: catalogForPrompt,
              census: patients,
              referral: text,
            }),
          },
        ],
      },
      { timeout: TIMEOUT_MS },
    );

    if (res.stop_reason === "refusal") return fallback(text, patients, "refusal");

    const textBlock = res.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return fallback(text, patients, "no_text_block");
    }

    const parsed = JSON.parse(textBlock.text) as Omit<
      ExtractedOrder,
      "aiUsed" | "fallbackReason" | "ledger"
    >;

    // Belt over the schema's braces: drop anything outside our enums.
    const knownHcpcs = new Set(HCPCS);
    const knownPatients = new Set(patients.map((p) => p.id));
    const items = parsed.items.filter((i) => knownHcpcs.has(i.value));
    const patientId =
      parsed.patientId && knownPatients.has(parsed.patientId.value)
        ? parsed.patientId
        : null;

    const u = res.usage;
    const cachedIn = u.cache_read_input_tokens ?? 0;
    const ledger: TokenLedgerEntry = {
      at: new Date().toISOString(),
      kind: "order_intake",
      model: MODEL,
      inputTokens: u.input_tokens,
      outputTokens: u.output_tokens,
      cachedInputTokens: cachedIn,
      costUsd:
        (u.input_tokens / 1e6) * IN_PER_MTOK +
        (cachedIn / 1e6) * CACHED_IN_PER_MTOK +
        (u.output_tokens / 1e6) * OUT_PER_MTOK,
    };

    return {
      items,
      urgency: parsed.urgency,
      targetHoursFromNow: parsed.targetHoursFromNow,
      patientId,
      unmapped: parsed.unmapped ?? [],
      aiUsed: true,
      ledger,
    };
  } catch (err) {
    return fallback(
      text,
      patients,
      err instanceof Error ? `error:${err.name}` : "error:unknown",
    );
  }
}
