import { notFound } from "next/navigation";
import type { Order } from "@/lib/contracts";
import { patientByFamilyToken, STUB_ORDERS } from "@/lib/data/stub-seed";

// Family tracker — read-only, reached by a text-message link. Calm by
// design: no status colors, no jargon, nothing to learn. The one page
// in the product where the reader may be grieving.

export default async function FamilyPage({ params }: PageProps<"/f/[token]">) {
  const { token } = await params;
  const patient = patientByFamilyToken(token);
  if (!patient) notFound();

  const orders = STUB_ORDERS.filter((o) => o.patientId === patient.id);

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

        {patient.status === "deceased" && (
          <p className="text-sm leading-relaxed text-ink-soft">
            We&apos;re so sorry for your loss. Below is everything that will
            happen with the medical equipment in the home — you don&apos;t need
            to call anyone or do anything.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {orders.map((o) => (
            <FamilyCard key={o.id} order={o} deceased={patient.status === "deceased"} />
          ))}
        </div>

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
          This page updates automatically. Synthetic demo data — no real
          patients.
        </p>
      </main>
    </div>
  );
}

function friendlyLine(order: Order, deceased: boolean): { headline: string; body: string } {
  const items = order.items.map((i) => i.name.toLowerCase()).join(" and ");
  switch (order.state) {
    case "ordered":
    case "dispatched":
    case "in_transit":
    case "at_risk": {
      const eta = order.etaAt
        ? new Date(order.etaAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
        : null;
      return {
        headline: `Your ${items} ${eta ? `arrives today by about ${eta}` : "is on its way"}`,
        body: "The delivery team will set everything up and show you how to use it. Someone should be home to let them in.",
      };
    }
    case "delivered":
      return {
        headline: `Your ${items} has been delivered and set up`,
        body: order.pod?.signedBy
          ? `Received by ${order.pod.signedBy}. If anything isn't working right, call the number below and we'll handle it.`
          : "If anything isn't working right, call the number below and we'll handle it.",
      };
    case "pickup_triggered": {
      const due = order.pickup?.dueAt
        ? new Date(order.pickup.dueAt).toLocaleString([], {
            weekday: "long",
            hour: "numeric",
            minute: "2-digit",
          })
        : null;
      return {
        headline: `Pickup of the ${items} is scheduled${due ? ` — by ${due}` : ""}`,
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

function FamilyCard({ order, deceased }: { order: Order; deceased: boolean }) {
  const line = friendlyLine(order, deceased);
  return (
    <div className="rounded-lg bg-surface border border-line p-4">
      <div className="text-sm font-semibold text-ink leading-snug">{line.headline}</div>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{line.body}</p>
    </div>
  );
}
