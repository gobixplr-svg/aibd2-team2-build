"use client";

import type { Order, Patient } from "@/lib/contracts";
import { Pulse } from "@/lib/pulse";
import { DraftCard } from "./draft-card";
import {
  deadlineLabel,
  dmeMonthlyRunRate,
  effectiveDeadline,
  orderNeedsAttention,
  pillFor,
  rxSpendMonthlyTotal,
  type InboxItem,
} from "./derive";

// "Today" — the RN's single source of action items (Dan's rehearsal ask).
// One screen that answers "what needs me, in what order?": delayed
// pickups and consequential AI proposals first, family drafts to review
// and send second, at-risk watches last. Everything here is assembled
// from state the board already holds — approvals resolve inline through
// the same handlers as the tray, and each order row links to the tab
// where the work lives.

export function TodayTab({
  orders,
  patients,
  inbox,
  moneyAccruing,
  onApproveDraft,
  onDismissDraft,
  onGoto,
}: {
  orders: Order[];
  patients: Patient[];
  inbox: InboxItem[];
  moneyAccruing: number;
  onApproveDraft: (id: string, draft?: string) => void;
  onDismissDraft: (id: string) => void;
  onGoto: (tab: "equipment") => void;
}) {
  const pending = inbox.filter((i) => i.needsApproval);
  const drafts = pending.filter((i) => i.draft);
  const proposals = pending.filter((i) => !i.draft);
  const attention = orders.filter(orderNeedsAttention);
  // Orders already represented by a pending proposal don't need a second row.
  const proposalOrderIds = new Set(
    pending.map((i) => i.context?.split(" · ")[1]).filter(Boolean),
  );
  const watches = attention.filter((o) => !proposalOrderIds.has(o.id));
  // "DME spend alongside medication spend, not in a separate silo"
  // (bounty Required Features) — on the RN's home screen, not only in
  // Analytics. Monthly run-rate + Rx monthly, same math as Analytics.
  const costOfCareMonthly = Math.round(dmeMonthlyRunRate(orders) + rxSpendMonthlyTotal(patients));

  const empty = proposals.length === 0 && drafts.length === 0 && watches.length === 0;

  return (
    <div className="p-5 bg-cream">
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="mb-1 text-[20px] font-semibold text-ink">Today</div>
        <div className="mb-4 text-[13px] text-ink-soft">
          Everything that needs a person, most urgent first — approvals resolve right here.
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile
            label="Needs attention"
            value={String(attention.length)}
            critical={attention.length > 0}
          />
          <StatTile
            label="Waiting on approval"
            value={String(pending.length)}
            critical={proposals.length > 0}
          />
          <StatTile
            label="Rental $ accruing"
            value={`$${moneyAccruing.toFixed(2)}`}
            critical={moneyAccruing > 0}
          />
          <StatTile
            label="Cost of care (mo.) · DME + Rx"
            value={`$${costOfCareMonthly.toLocaleString()}`}
          />
        </div>

        {empty && (
          <div className="rounded-xl border border-dashed border-line-strong py-10 text-center text-sm text-muted">
            Nothing waiting — a good shift looks exactly like this.
          </div>
        )}

        {proposals.length > 0 && (
          <Section label="Act now" sub="AI-proposed, a person decides">
            {proposals.map((p) => (
              <Pulse key={p.id} watch={p.detail} className="rounded-xl border border-critical/30 bg-page p-3.5">
                <div className="flex items-baseline gap-2">
                  <span className="rounded-full bg-critical px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
                    Act now
                  </span>
                  {p.context && <span className="text-[13px] font-semibold text-ink">{p.context}</span>}
                </div>
                <div className="my-1.5 text-[13.5px] font-medium leading-relaxed text-ink">{p.detail}</div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => onApproveDraft(p.id)}
                    className="rounded-md bg-brand px-3 py-1.5 text-[12px] font-semibold text-white"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => onDismissDraft(p.id)}
                    className="rounded-md border border-line-strong px-2.5 py-1.5 text-[12px] text-ink-soft"
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={() => onGoto("equipment")}
                    className="ml-auto rounded-md border border-line-strong px-2.5 py-1.5 text-[12px] text-ink-soft"
                  >
                    Open on the board →
                  </button>
                </div>
              </Pulse>
            ))}
          </Section>
        )}

        {drafts.length > 0 && (
          <Section label="Review & send" sub="Claude drafted these — your words go out, not the AI's">
            {drafts.map((d) => (
              <div key={d.id} className="rounded-xl border border-warning/40 bg-page p-3.5">
                <div className="flex items-baseline gap-2">
                  <span className="rounded-full bg-warning px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink">
                    Family message
                  </span>
                  {d.context && <span className="text-[13px] font-semibold text-ink">{d.context}</span>}
                </div>
                <DraftCard item={d} onApprove={onApproveDraft} onDismiss={onDismissDraft} />
              </div>
            ))}
          </Section>
        )}

        {watches.length > 0 && (
          <Section label="Watch" sub="flagged before they're late — no decision needed yet">
            {watches.map((o) => (
              <button
                key={o.id}
                onClick={() => onGoto("equipment")}
                className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-page px-3.5 py-2.5 text-left"
              >
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${pillFor(o).className}`}
                >
                  {pillFor(o).label}
                </span>
                <span className="text-[13px] font-medium text-ink">{o.patientLabel}</span>
                <span className="text-[12px] text-ink-soft">
                  {o.items.map((i) => i.name).join(", ")}
                </span>
                <span className="ml-auto text-[12px] tabular-nums text-ink-soft">
                  due {deadlineLabel(effectiveDeadline(o))}
                </span>
                <span className="text-muted">›</span>
              </button>
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({
  label,
  sub,
  children,
}: {
  label: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-ink">{label}</span>
        <span className="text-[12px] text-muted">{sub}</span>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function StatTile({
  label,
  value,
  critical,
}: {
  label: string;
  value: string;
  critical?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div
        className={`mt-0.5 text-[23px] font-semibold tabular-nums ${critical ? "text-critical" : "text-ink"}`}
      >
        {value}
      </div>
    </div>
  );
}
