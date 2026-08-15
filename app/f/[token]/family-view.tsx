"use client";

import type { OrderState, Patient } from "@/lib/contracts";
import { Pulse } from "@/lib/pulse";
import { useWorld } from "@/lib/use-world";

interface FamilyOrder {
  id: string;
  state: OrderState;
  items: string[];
  targetAt: string;
  etaAt?: string;
  pickup?: { dueAt: string; windowStart?: string; windowEnd?: string };
}

interface CareMessage {
  id: string;
  text: string;
  at: string;
}

export function FamilyView({ token }: { token: string }) {
  const { state, error } = useWorld<{
    patient: Patient;
    orders: FamilyOrder[];
    careMessages?: CareMessage[];
  }>(`?scope=family&token=${encodeURIComponent(token)}`);

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
            return (
              <Pulse key={o.id} watch={line.headline} className="rounded-lg bg-surface border border-line p-4">
                <div className="text-sm font-semibold text-ink leading-snug">
                  {line.headline}
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{line.body}</p>
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

  switch (o.state) {
    case "ordered":
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
