import Link from "next/link";

// Deliverable C — the differentiation snapshot as an in-app page.
// Compressed from prep/betterrx/market-research.md (researched Aug 14,
// 2026, three parallel deep dives, sources inline in that doc). The
// rubric's 30% line is "did the team understand today's market well
// enough to beat it" — this page is that understanding, one screen.

export const metadata = {
  title: "Differentiation snapshot — Handoff",
};

const LANDSCAPE: { player: string; what: string; gap: string }[] = [
  {
    player: "Dragonfly Health",
    what: "#1 hospice DME benefit manager (StateServ + Hospicelink; acquired Enclara Pharmacia 2025). Takes margin on equipment.",
    gap: "Auto-pickup trigger on select EMRs only — no acknowledged/scheduled/completed loop, no SLA clock, no family layer. Their network displaces the hospice's own vendors.",
  },
  {
    player: "Qualis",
    what: "Independent hospice DME benefits manager, 900+ contracted vendors, Axxess integration.",
    gap: "SLAs are contract terms, not live-scored performance. No family communication.",
  },
  {
    player: "Synapse Equip",
    what: "Hospice/SNF DME product; consolidated invoicing, EMR integration.",
    gap: "The hospice must adopt Synapse's vendor network — it loses vendor choice.",
  },
  {
    player: "National HME",
    what: "Hospice DME vendor with the best delivery-visibility UX in the niche (real-time ETA texts, pickup requests).",
    gap: "A single vendor's portal — it only ever shows their own trucks.",
  },
  {
    player: "Parachute Health",
    what: "Part B e-prescribing network standard; AI fax intake.",
    gap: "Built for payer documentation — irrelevant under hospice per-diem. No pickup lifecycle at all, no hospice product.",
  },
  {
    player: "Hospice EMRs",
    what: "HCHB / Axxess / MatrixCare / WellSky — the system of record; DME via partner integrations.",
    gap: "Visibility dies the moment the order leaves the EMR. DME is a pass-through, not a product.",
  },
];

const WHITESPACE: { claim: string; inApp: string; where?: string }[] = [
  {
    claim:
      "Neutral two-sided coordination software. Every player is a benefit manager inserting itself between hospice and vendor, or one vendor's portal. Nobody sells pure software where the hospice keeps its own local vendors and both sides share one board.",
    inApp:
      "The hospice portal and the vendor's phone view are the same server world — one database, two sides, no network to join and no margin taken on equipment.",
    where: "/board",
  },
  {
    claim:
      "Pre-late delivery risk scoring. Nobody in the market flags an order as likely-to-go-late before it is late — all market AI targets document intake, zero is applied to fulfillment risk.",
    inApp:
      "The engine scores every open order against its deadline on a heartbeat and flags at-risk orders with a legible, computed why — before the deadline passes, not after.",
  },
  {
    claim:
      "Post-death pickup as a closed loop. Dragonfly can auto-trigger a pickup on select EMRs, but with no vendor-acknowledged → scheduled → completed states, no elapsed-time alarm, no family visibility.",
    inApp:
      "Pickup here is a loop with states, a 24-hour SLA clock, escalation when it ages, and the accruing rental cost of every extra day on screen.",
  },
  {
    claim:
      "Family-facing communication. Nothing exists in hospice DME, even though CAHPS hinges on family experience.",
    inApp:
      "A read-only magic-link tracker for the family, with updates drafted by AI and approved word-by-word by a human before anything is sent.",
    where: "/f/demo-family",
  },
  {
    claim:
      "Small-vendor enablement. Local shops run on fax and phone; no lightweight onboarding exists for them.",
    inApp:
      "A vendor works a full order lifecycle from a phone via magic link — no account, no install, no software purchase. That is the cold start.",
    where: "/v/demo-vendor",
  },
];

export default function SnapshotPage() {
  return (
    <main className="flex-1 bg-page px-4 py-10 md:py-14">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <header>
          <div className="text-sm font-semibold uppercase tracking-wider text-brand">
            Deliverable C · Differentiation snapshot
          </div>
          <h1 className="mt-1 text-[28px] font-bold text-navy md:text-[34px]">
            The neutral rail nobody built
          </h1>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-ink-soft">
            Hospice DME today is coordinated by <strong>benefit managers</strong>{" "}
            that insert their own vendor network between the hospice and its
            equipment and take margin on it, or by a{" "}
            <strong>single vendor&apos;s portal</strong> that only shows its own
            trucks — while EMRs lose the order the moment it leaves. Handoff is
            neither: neutral software where the hospice keeps its existing local
            vendors, the vendor keeps its trucks, and both sides watch one
            board. It is the model BetterRX&apos;s own eRx already proved for
            pharmacy, ported to DME.
          </p>
        </header>

        <section>
          <h2 className="text-base font-semibold uppercase tracking-wide text-navy">
            The market today
          </h2>
          <p className="mt-1 text-sm text-muted">
            ~80% of DME orders are still placed by fax, phone, or a
            vendor-specific portal — even when they start in an EHR. There is no
            DME e-ordering standard.
          </p>
          <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[12px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 font-semibold">Player</th>
                  <th className="px-3 py-2 font-semibold">What they are</th>
                  <th className="px-3 py-2 font-semibold">The gap</th>
                </tr>
              </thead>
              <tbody>
                {LANDSCAPE.map((row) => (
                  <tr key={row.player} className="border-b border-line last:border-b-0 align-top">
                    <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-ink">
                      {row.player}
                    </td>
                    <td className="px-3 py-2.5 leading-relaxed text-ink-soft">{row.what}</td>
                    <td className="px-3 py-2.5 leading-relaxed text-ink-soft">{row.gap}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-base font-semibold uppercase tracking-wide text-navy">
            Verified white space — and where this app answers it
          </h2>
          <p className="mt-1 text-sm text-muted">
            Each claim checked against every product surveyed (full sourcing in
            the repo&apos;s market research).
          </p>
          <div className="mt-3 flex flex-col gap-2.5">
            {WHITESPACE.map((w, i) => (
              <div key={i} className="rounded-lg border border-line bg-surface p-4">
                <div className="text-sm font-medium leading-relaxed text-ink">{w.claim}</div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="shrink-0 rounded-sm bg-teal/15 px-1.5 py-0.5 text-[12px] font-semibold uppercase tracking-wide text-teal">
                    In this app
                  </span>
                  <span className="text-sm leading-relaxed text-ink-soft">
                    {w.inApp}{" "}
                    {w.where && (
                      <Link href={w.where} className="font-medium text-brand underline-offset-2 hover:underline">
                        {w.where} →
                      </Link>
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          <div className="rounded-lg border border-line bg-surface p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-navy">
              Why a hospice cares
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
              The two moments it gets blamed for but cannot see — equipment late
              before a discharge, equipment lingering after a death — become
              visible, scored before they fail, and closed with a family-facing
              record. It keeps its own vendors and its per-diem economics; in
              the SSVI/HOPE era, the auditable order trail doubles as
              compliance evidence.
            </p>
          </div>
          <div className="rounded-lg border border-line bg-surface p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-navy">
              Why a vendor cares
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
              Day one: order flow from a phone with zero setup. Over time: the
              SLA scorecard becomes a sales asset, the proof-of-delivery trail
              attacks the 15–25% of DME claims that deny on documentation, and
              route-level visibility lowers cost-to-serve exactly as
              competitive bidding squeezes margins from 2028.
            </p>
          </div>
        </section>

        <footer className="flex flex-col gap-1 border-t border-line pt-3 text-[13px] text-muted">
          <span>
            Researched Aug 14, 2026 — competitive claims verified per product;
            sources inline in the repo&apos;s market-research doc. Synthetic
            data only; no real patients, vendors, or PHI.
          </span>
          <Link href="/" className="text-brand hover:underline">
            ← All surfaces
          </Link>
        </footer>
      </div>
    </main>
  );
}
