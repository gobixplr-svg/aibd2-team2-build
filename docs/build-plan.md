# BetterRX build plan — what we actually build

*Ported from the `ai-builder-day-2` prep repo now that `aibd2-team2-build` is the only repo we're working from. Original history: `prep/betterrx/build-plan.md` + the hospice-side (B) additions and `inventory-research.md` reconciliation from [ai-builder-day-2#1](https://github.com/gobixplr-svg/ai-builder-day-2/pull/1).*

Working name: **Handoff** (rename by team vote, 60 seconds max). One Next.js app, two faces, one shared brain.

**The one-sentence demo end-state:** A case manager places a bed+oxygen order at the bedside, the vendor's dispatcher accepts it on a phone with no account, both watch the same status board, the system flags the order *before* it misses the 4:30 discharge, and when the patient later dies the pickup triggers itself — no phone call, and a respectful, human-approved message goes to the family.

## What we build (priority tiers)

### P0 — the demo dies without these
1. **Order lifecycle state machine** — their exact 6 stages (Ordered → Dispatched → In Transit/At Risk → Delivered → Pickup Triggered → Pickup Delayed) as one server-side model. Everything else renders this.
2. **Hospice view — the DME dashboard** (tablet-first): patient list → new-order form (equipment picker w/ HCPCS E-codes, urgency, target date tied to discharge, **vendor picker** — "vendor choice within a market" is a required hospice-side feature; most hospices run 2+ vendors) → live status board with risk badges, **filterable by equipment type and searchable by patient or asset**, giving clinical staff one screen for equipment needs, ordering, dispatch status, and on-hand inventory (item 10) instead of four separate pages. *(B)*
3. **Vendor view** (phone-first, zero login via magic link): incoming queue → accept → assign route + ETA → status updates → **proof of delivery** (photo/signature/timestamp) → pickup jobs queue.
4. **Risk engine v1 (deterministic — and we say so proudly):** ETA vs. discharge deadline math fires "At Risk"; pickup age past 48h fires "Pickup Delayed." Legible "why flagged" on every badge.
5. **EMR simulator panel:** a small admin page that flips a patient's status to *deceased* → pickup auto-triggers. This *is* the integration story made visible (HCHB status-change pattern), not a toy.
6. **Escalation:** risk crossing threshold → alert to case manager + vendor rep (in-app notification center; SMS/email simulated).

### P1 — the differentiators (build in this order)
7. **Vendor cold-start onboarding** — hospice sends invite → magic link → 3-field form (service area, equipment types, hours) → live and accepting orders in under 2 minutes. Their declared hardest part; carries the 30% differentiation criterion.
8. **AI order intake:** paste a messy referral (fax OCR text, phone-call transcript) → Claude extracts a structured order with per-field confidence → case manager confirms before it's placed. This is our *strongest* AI-earns-its-place story (no rules engine parses free text).
9. **Vendor SLA scorecard + serialized inventory lite:** on-time %, avg pickup time, POD completeness — accrues automatically from timestamps. The cold start solves its own data problem. Each equipment unit gets an asset ID with a three-state view (in stock / deployed / **overdue for pickup**) — "serialized equipment inventory" is on the brief's required vendor-side list, and the overdue-for-pickup state doubles as the pickup-delay engine's data source.
10. **On-site (consignment) inventory + dispatch routing** *(revised per `inventory-research.md`)*: hospices commonly hold vendor-titled stock on-site for the **small/portable formulary** — walkers, wheelchairs, commodes, nebulizers, braces. **Beds, pressure mattresses, concentrators, and lifts stay warehouse-dispatched** — don't model those as loan-closet items, that's the mistake in the original draft of this item. Vendor retains title throughout (standard consignment terms: facility can't profit on it, patient keeps vendor choice, undocumented shrinkage is a chargeable/compliance event — OIG space-rental-safe-harbor territory if judges probe it). Model the real per-asset lifecycle, not a two-value flag: `at-warehouse → in-transit → on-hand-at-hospice (consignment) → deployed-at-patient → pending-pickup → in-transit-return → maintenance/cleaning → at-warehouse`. On the order form this collapses to **two fulfillment paths** for consignment-eligible items: **On-hand** (dispatch from hospice stock, no vendor round-trip) vs. **Vendor dispatch** (existing P0 flow). Also the natural place for **direct vendor dispatch/ordering** (order straight from a specific vendor's live stock) as the fallback when on-hand stock can't cover it. Strengthens the differentiation story (30% weight) — no incumbent routes hospice-held stock as a fulfillment source, and "forecasting is greenfield" per the research, so we can say that out loud instead of faking precision. *(B, cross-lane — needs Will's sign-off on the location state machine in `contracts.ts` and Dan's on the vendor-dispatch fallback UI before this is committed, not just built solo.)*
11. **Family-facing messaging:** Claude drafts the pickup-delay apology/update in a respectful tone; human approves before "send." Judges will read these words.
12. **Risk engine v2 (statistical layer):** per-vendor on-time rates sliced by order type/urgency/day-of-week, computed from synthetic history — surfaces "this vendor's STAT on-time rate is degrading" *before* the deterministic flag would fire.
13. **Cost visibility:** DME spend next to medication spend per patient (the eRx side-by-side story).

### P2 — only if cruising
Route-progress ticker (simulated GPS) · daily digest ("daily briefing" pattern) · analytics page with CMS-grounded market context · resupply cadence for consumables (on the brief's vendor-side list — if unbuilt, *state* it in the integration sketch as a scheduled-order type rather than pretend it doesn't exist).

**Deliverables checklist (the brief names five — own each):** A working app = P0 · B AI defense = section below (A owns) · **C differentiation snapshot = one-page in-app comparison vs. benefit managers / single-vendor portals / EMR pass-throughs, from `market-research.md` (C owns, Sat AM)** · D integration sketch = HCHB diagram + order JSON (C owns) · E example scenarios = the demo narrative's three beats, written up (B owns).

## Over-the-top tier — the "full end-to-end experience" moves (Day 1's winning muscle)

Ranked by demo-impact-per-build-hour. Slot after P1; each is independently cuttable.

1. **The family tracker (cheap, and the emotional peak of the demo).** The brief has three stakeholders but only asks us to build for two. The third — the family — is its emotional core ("very distressing to see the equipment of a loved one still lingering"). Build: a read-only, magic-link status page a family member gets by text. Delivery day: "Your hospital bed arrives today between 2–4 PM." After a death: "Pickup is scheduled for tomorrow at 10 AM. No one needs to be home. We're so sorry for your loss." One page, no login, tone written with care. This is the CAHPS story made tangible, and no team building only what was asked will have it. ~2 hours.
2. **The money counter (nearly free — it's arithmetic on data we already have).** Every delayed pickup accrues extra rental days at real CMS rates (E0260 ≈ $49/mo → per-day). Every buffer day hospices pad "out of habit" has a cost. A small "cost of poor coordination" widget on the hospice dashboard, and a rolled-up number in the pitch: "across your census, late pickups cost $X/month." Judges quoted this pain themselves ("we have to pay for an additional day"). ~1 hour.
3. **The pitch-back: answer their discovery question (zero build, pure pitch).** BetterRX said outright this bounty pressure-tests "delivery visibility, not DME ownership" — so *tell them what we found*. Close the pitch with 60 seconds of business case: land via existing eRx hospice customers → hospices invite their own vendors (cold start) → SLA data accrues → the data becomes the network moat, sold as an eRx module. We're the only team treating the bounty as what they said it is: a discovery exercise. ~0 hours, rehearsal only.
4. **Voicemail-to-order (theater upgrade to P1's AI intake).** Play a 15-second recording — a nurse's after-hours voicemail ordering a bed and oxygen — and watch the structured order appear with confidence flags for human confirm. Same extraction pipeline as P1 item 8, plus one audio transcription call. Attacks the "nationals only work M–F 9–5" quote head-on. ~1 hour on top of intake.
5. **After-hours failover (medium).** Primary vendor doesn't accept a STAT order within N minutes → auto-offer to backup vendor, hospice notified. Completes the ops story: the system doesn't just *see* failure coming, it routes around it. ~2–3 hours; cut first if behind.
6. **Claim-ready documentation package (medium).** On POD capture, assemble the claim-support bundle (POD + timestamps + order provenance → X12 837-shaped stub with a completeness checklist) attacking the 15–25% denial rate. This is the feature that makes *vendors* want to join — it pays for the cold start. ~2–3 hours; strong Q&A ammo even if only half-built.
7. **DME utilization insights — par-level & turnover recommendations (statistics for the math, AI only for the narration)** *(revised per `inventory-research.md`)*. Item 10 timestamps every on-hand dispatch and every vendor dispatch for the consignment-eligible formulary (walkers, wheelchairs, commodes, nebulizers, braces) — that's the whole dataset this needs. Compute per-HCPCS-code turnover (dispatches ÷ average on-hand count over the window) and days-of-supply against real benchmarks instead of invented examples: **80–130% of average daily census (ADC)** is the normal utilization band, and facilities without visibility carry **20–30% excess devices** to cover unlocatable gear — that gap is the panel's whole thesis. Flag over/under-stocked codes against actual usage — deterministic, same as the risk engine. Panel copy example: *"You're carrying 6 wheelchairs against an ADC-adjusted need of ~4 — in range, but check the top of the 130% band before reordering."* Claude's only job is turning the numbers into plain language, template-constrained to the computed features — identical guardrail to the risk-explanation pattern, not a new AI category to defend. State plainly in Q&A that **no published par-level or demand-forecasting model exists for hospice DME** — this is genuinely greenfield, so we say that instead of faking precision. Depends entirely on item 10 shipping first; cut with it if item 10 doesn't get team sign-off. ~1–2 hours once item 10's data model exists. **Note:** the user's longer-term ask — a full AI analytics/recommendation product for DME stocking — is bigger than a weekend build; this is the demo-sized proof-of-concept slice of it, not the whole thing. The full version belongs in the "Monday plan" business case, not P0–P2. *(B)*
8. **Per-equipment/per-order notes (cheap, and it's the audit trail).** A single timestamped, attributed notes thread on every order and every asset — any actor (admissions nurse, case manager, DON, vendor dispatcher, family) can add a free-text note ("swapped for a bariatric bed at family's request," "unit smells of smoke, holding for deep clean"). No new page: it's one shared component that mounts wherever an order or asset already renders. Doubles as the compliance answer already in the pitch's close (SSVI/HOPE-era audit evidence) — this is what makes that sentence demonstrably true instead of aspirational. ~1 hour: one `notes[]` array on the contract + one shared component. *(Cross-lane — proposed by B, but it renders on Dan's vendor/family screens too and needs Will's `notes[]` field in `contracts.ts`; not solely B's to build.)*

**Demo theater (free, decide Saturday morning):** two devices on camera — tablet in B's hands as the case manager, phone in C's as the vendor driver capturing POD. The judges watch the handoff happen physically.

## The AI defense (rubric: 15%, and they grill on it)

Say exactly this structure: **"Rules where rules win, AI where rules can't go."**
- **Deterministic (we chose rules, per your brief):** the At-Risk flag itself (ETA > deadline is arithmetic), pickup aging, escalation thresholds. Zero hallucination risk on safety-critical state.
- **Statistics (not AI, and we say so):** vendor SLA rates. Honest label = credibility.
- **AI, defended:** (a) unstructured order intake — pattern complexity no rules engine handles; guarded by per-field confidence + mandatory human confirm; (b) risk *explanations* grounded strictly in the computed features (template-constrained, no invented numbers); (c) family message drafting — tone is a language problem; human approves every send.
- **Token cost per order (fill in Friday):** intake ~1 call + explanation ~1 call + message ~0.3 calls ≈ 3–5K input / ~1K output tokens on Sonnet → **cents per order**; state the number and the per-patient-month figure (avg LOS ≈ 75 days, from cms-data-notes.md).
- **Market precedent (from `market-research.md`, cite in Q&A):** AI *intake* is the one AI category the market has validated in DME — Tennr ($101M Series C, >99.8% claimed accuracy *with confidence-threshold human routing*), Synthpop (DME-specific, "40 min → under 1 min"), and Parachute/Brightree/Tomorrow all shipping it. Fulfillment-risk scoring has **zero incumbents** — we're first, so we demo it as feature-driven math + model, not magic. Cautionary tales to raise unprompted: nH Predict ("our AI accelerates and flags; it never denies, delays, or withholds equipment — the exact inverse"), Whisper hallucinations (we keep source fax/voicemail beside every extraction), generic-LLM extractors under F₁ 65% on medical docs (why human confirm is structural, not decorative).

## Synthetic data (from `cms-data-notes.md`)

Generator seeds patients by CMS diagnosis mix (circulatory 31% / neuro 26% / cancer 23% / respiratory 10%) → equipment weighted by real claim volumes (oxygen E1390 #1, use **E0260** for beds, keep E0250 + E1130 to mirror their samples). ~40–60 historical orders per vendor with realistic on-time patterns so the v2 risk layer has something true to find. Utah names: "Wasatch Hospice," "Great Basin Medical Supply," "Timpanogos DME."

## Flagged by B for other lanes (raise at next standup — not yet agreed)

- **Confirm-gate as a state-machine-wide rule** (affects Will's `transition()`): every stage change should be an explicit human tap — dispatcher, nurse, DON, case manager — never silent/automatic, generalizing the confirm-gate already used on AI intake (P1 item 8) and family messaging (P1 item 11) into a rule for the whole lifecycle rather than leaving it implicit per feature.
- **Cleaning/decontamination checklist depth** (affects Dan's POD condition checklist): "clean" is currently one checkbox inside the existing 3-item checklist (clean / functional / complete). Worth confirming whether that's sufficient or whether a fuller cleaning protocol is wanted — it matters more once item 10 has hospice-held units getting reused across patients.

## Roles (agreed hour 1, then parallel — see `docs/lane-cards.md` for the current, re-locked assignment)

| Role | Fri 3–5 | Fri evening | Sat AM |
|---|---|---|---|
| **A — Engine & Data** | data generator + state machine | risk v1 + vendor stats | risk v2 + explanations + token-cost math |
| **B — Hospice side** | order form + patient list | status board + EMR simulator | family messaging + escalation UX + cost view |
| **C — Vendor side** | magic-link queue + accept/assign | POD capture + pickup queue | cold-start onboarding + SLA scorecard + integration diagram |

**Hour 1 (2:00–3:00, together):** demo end-state agreed → order-record JSON contract → route map → deploy empty app to Vercel. Nobody writes a feature until the contract is on the whiteboard.

**Checkpoints:** Fri 5:00 order flows hospice→vendor end-to-end · Fri night risk flag renders · Sat 10:00 full demo narrative clicks through · **12:30 freeze** → backup video → rehearse ×2.

## Pitch (5 min, weights in parentheses)

1. The two blame moments, in their quotes (30s) — problem credibility.
2. Live demo: the 6-step narrative from `domain-notes.md` (2:30) — core problems (25%) + UX (15%).
3. Cold start: invite a vendor live, phone on screen (45s) — differentiation (30%).
4. "Rules where rules win" + cost per order (45s) — AI ROI (15%).
5. Integration diagram: eRx + HCHB status-change pattern (30s) — integration (15%).

B drives demo · A delivers AI defense · C delivers cold start + integration.
