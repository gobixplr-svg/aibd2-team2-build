"use client";

import { useState } from "react";
import type { OrderState, Patient } from "@/lib/contracts";
import { Pulse } from "@/lib/pulse";
import { postJson, useWorld } from "@/lib/use-world";

interface FamilyOrder {
  id: string;
  state: OrderState;
  items: string[];
  targetAt: string;
  etaAt?: string;
  pickup?: { dueAt: string; windowStart?: string; windowEnd?: string; completedAt?: string };
}

interface CareMessage {
  id: string;
  text: string;
  at: string;
}

// Slot labels only — no ISO math. The message is plain family language;
// the care team and vendor pick the actual new time on their side.
const CONFLICT_SLOTS = [
  { label: "Earlier today", phrase: "earlier today" },
  { label: "This evening", phrase: "this evening" },
  { label: "Tomorrow morning", phrase: "tomorrow morning" },
  { label: "Tomorrow afternoon", phrase: "tomorrow afternoon" },
];

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(iso).toLocaleString([], opts);

// The scheduled moment a family could have a conflict with: a delivery
// ETA, or a committed pickup window. Completion is on the pickup record.
function conflictMoment(
  o: FamilyOrder,
): { kind: "delivery" | "pickup"; text: string } | null {
  if (o.pickup?.completedAt) return null;
  if (["dispatched", "in_transit", "at_risk"].includes(o.state) && o.etaAt)
    return {
      kind: "delivery",
      text: `today around ${fmt(o.etaAt, { hour: "numeric", minute: "2-digit" })}`,
    };
  if (
    (o.state === "pickup_triggered" || o.state === "pickup_delayed") &&
    o.pickup?.windowStart &&
    o.pickup?.windowEnd
  )
    return {
      kind: "pickup",
      text: `${fmt(o.pickup.windowStart, { weekday: "long", hour: "numeric" })}–${fmt(o.pickup.windowEnd, { hour: "numeric" })}`,
    };
  return null;
}

export function FamilyView({ token }: { token: string }) {
  const { state, error } = useWorld<{
    patient: Patient;
    orders: FamilyOrder[];
    careMessages?: CareMessage[];
  }>(`?scope=family&token=${encodeURIComponent(token)}`);

  const [conflictFor, setConflictFor] = useState<string | null>(null);
  const [notified, setNotified] = useState<Record<string, boolean>>({});
  const [sendFailed, setSendFailed] = useState<string | null>(null);

  if (error)
    return (
      <div className="min-h-dvh bg-cream flex items-center justify-center p-6">
        <p className="text-sm text-ink-soft">This link isn&apos;t active. Call your hospice care team.</p>
      </div>
    );
  if (!state)
    return <div className="min-h-dvh bg-cream" />;

  const { patient, orders } = state;
  const careMessages = state.careMessages ?? [];
  const deceased = patient.status === "deceased";

  async function sendConflict(
    o: FamilyOrder,
    moment: { kind: "delivery" | "pickup"; text: string },
    slot: (typeof CONFLICT_SLOTS)[number],
  ) {
    const items = o.items.map((n) => n.toLowerCase()).join(" and ");
    // Plain first-person family text — it rides the same inbound-message
    // pipeline a typed text would, so Hermes triages it and the care
    // team sees it next to everything else.
    const body =
      moment.kind === "delivery"
        ? `The ${items} is scheduled to arrive ${moment.text}, but that time doesn't work for our family — ${slot.phrase} would be better. Could it be rescheduled?`
        : `The pickup of the ${items} is scheduled for ${moment.text}, but that window doesn't work for us — ${slot.phrase} would be better. Could it be rescheduled?`;
    const ok = await postJson("/api/messages", {
      patientId: patient.id,
      orderId: o.id,
      body,
      from: "family",
    });
    if (ok) {
      setNotified((n) => ({ ...n, [o.id]: true }));
      setConflictFor(null);
      setSendFailed(null);
    } else {
      setSendFailed(o.id);
    }
  }

  return (
    <div className="min-h-dvh w-full bg-cream">
      <main className="mx-auto w-full max-w-md px-5 py-10 flex flex-col gap-6">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
            Wasatch Hospice · equipment updates
          </div>
          <h1 className="text-xl font-semibold text-ink">
            For the family of {patient.label}
          </h1>
        </div>

        {deceased && (
          <p className="text-sm leading-relaxed text-ink-soft">
            We&apos;re so sorry for your loss. Below is everything that will happen with
            the medical equipment in the home — you don&apos;t need to call anyone or do
            anything.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {orders.map((o) => {
            const line = friendlyLine(o, deceased);
            const moment = conflictMoment(o);
            return (
              <Pulse key={o.id} watch={line.headline} className="rounded-lg bg-surface border border-line p-4">
                <div className="text-sm font-semibold text-ink leading-snug">
                  {line.headline}
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{line.body}</p>

                {moment && notified[o.id] && (
                  <p className="mt-3 text-sm font-medium text-teal">
                    ✓ Your care team has been notified — they&apos;ll confirm a new
                    time right here.
                  </p>
                )}
                {moment && !notified[o.id] && conflictFor !== o.id && (
                  <button
                    onClick={() => setConflictFor(o.id)}
                    className="mt-3 text-left text-sm font-medium text-secondary underline"
                  >
                    Does this time not work? Tell your care team
                  </button>
                )}
                {moment && !notified[o.id] && conflictFor === o.id && (
                  <div className="mt-3 flex flex-col gap-1.5">
                    <div className="text-xs font-medium text-ink-soft">
                      What would work better? Your care team will confirm the
                      new time.
                    </div>
                    {CONFLICT_SLOTS.map((slot) => (
                      <button
                        key={slot.label}
                        onClick={() => sendConflict(o, moment, slot)}
                        className="rounded-md border border-line bg-cream px-3 py-2.5 text-left text-sm font-medium text-ink active:bg-line"
                      >
                        {slot.label}
                      </button>
                    ))}
                    {sendFailed === o.id && (
                      <p className="text-xs text-ink-soft">
                        That didn&apos;t go through — please call the number below
                        instead.
                      </p>
                    )}
                    <button
                      onClick={() => setConflictFor(null)}
                      className="self-start px-1 py-1 text-xs text-muted underline"
                    >
                      Never mind
                    </button>
                  </div>
                )}
              </Pulse>
            );
          })}
        </div>

        {careMessages.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              From your care team
            </div>
            {careMessages.map((m) => (
              <Pulse key={m.id} watch={m.id} className="rounded-lg bg-surface border border-line p-4">
                <p className="text-sm leading-relaxed text-ink">{m.text}</p>
                <div className="mt-1.5 text-[10px] text-muted">
                  {new Date(m.at).toLocaleString([], {
                    weekday: "long",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </div>
              </Pulse>
            ))}
          </div>
        )}

        <div className="rounded-lg bg-surface border border-line p-4">
          <div className="text-xs font-semibold text-ink">Questions?</div>
          <p className="mt-1 text-sm text-ink-soft">
            Call your hospice care team anytime at{" "}
            <a href="tel:+18015550142" className="font-medium text-secondary underline">
              (801) 555-0142
            </a>
            . You never need to contact the equipment company directly.
          </p>
        </div>

        <p className="text-[11px] text-muted">
          This page updates automatically. Synthetic demo data — no real patients.
        </p>
      </main>
    </div>
  );
}

function friendlyLine(o: FamilyOrder, deceased: boolean): { headline: string; body: string } {
  const items = o.items.map((n) => n.toLowerCase()).join(" and ");
  const t = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(iso).toLocaleString([], opts);

  // Completion lives on the pickup record, not order.state — check it
  // first or the family reads "scheduled" forever after the truck left.
  if (o.pickup?.completedAt) {
    return {
      headline: `The ${items} has been picked up`,
      body: deceased
        ? "Everything is taken care of — there is nothing more you need to do. Thank you for letting us care for your family."
        : "All done — there's nothing more you need to do.",
    };
  }

  switch (o.state) {
    // "Ordered" means the vendor hasn't accepted yet — nothing is moving,
    // so don't tell the family it's on its way. The line flips (and
    // pulses) the moment the dispatcher taps Accept.
    case "ordered":
      return {
        headline: `We're arranging your ${items}`,
        body: "Your care team has placed the order. This page will update the moment it's on the way.",
      };
    case "dispatched":
    case "in_transit":
    case "at_risk":
      return {
        headline: `Your ${items} ${
          o.etaAt
            ? `arrives today by about ${t(o.etaAt, { hour: "numeric", minute: "2-digit" })}`
            : "is on its way"
        }`,
        body: "The delivery team will set everything up and show you how to use it. Someone should be home to let them in.",
      };
    case "delivered":
      return {
        headline: `Your ${items} has been delivered and set up`,
        body: "If anything isn't working right, call the number below and we'll handle it.",
      };
    case "pickup_triggered": {
      const windowText =
        o.pickup?.windowStart && o.pickup?.windowEnd
          ? `${t(o.pickup.windowStart, { weekday: "long", hour: "numeric" })}–${t(o.pickup.windowEnd, { hour: "numeric" })}`
          : o.pickup?.dueAt
            ? `by ${t(o.pickup.dueAt, { weekday: "long", hour: "numeric", minute: "2-digit" })}`
            : null;
      return {
        headline: `Pickup of the ${items} is scheduled${windowText ? ` — ${windowText}` : ""}`,
        body: deceased
          ? "No one needs to be home, and there is nothing you need to prepare. The team will handle everything respectfully."
          : "No one needs to be home. The team will handle everything.",
      };
    }
    case "pickup_delayed":
      return {
        headline: `We're on the pickup of the ${items}`,
        body: "It's taking longer than it should, and your care team has been alerted. You don't need to call — we're handling it.",
      };
  }
}
