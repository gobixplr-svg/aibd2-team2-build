# Lane cards — who owns what (one card per person)

*Companion to [`kickoff-work-breakdown.md`](https://github.com/gobixplr-svg/ai-builder-day-2/blob/main/prep/betterrx/kickoff-work-breakdown.md). **RE-LOCKED at the 2:00 PM team sync (Granola note "Marketplace pressure and vendor consolidation strategy"): Will = engine · Garrett = vendor side (inherits Dan's `/v/` work: queue, POD + condition sheet, pickup clock — all pushed) · Dan = hospice side (kanban dashboard, family view, notification center, AI agent messaging) + the pitch.** Scope additions from that sync: AI-drafted first-pass notes on status changes, proactive reminders/urgency flagging, on-site inventory tracking + need forecasting (vendors keep equipment at hospice centers). **Git discipline changed: work on branches, pull before push, PR anything uncertain — no more direct-to-main.** DB: Postgres (local first). Zoom sync Sat 9–10 AM before the venue.*

## Repo layout (agreed once, prevents collisions)

```
app/
  (hospice)/            ← GARRETT: patient list, order form, board, inbox, cost view
  v/[token]/            ← DAN: vendor queue, accept, POD, pickups
  f/[token]/            ← GARRETT: family tracker (read-only)
  emr/                  ← GARRETT: EMR simulator panel
  api/                  ← route handlers; owner = whoever owns the feature
lib/
  engine/               ← WILL: tick(now), stages, thresholds, Claude triage
  data/                 ← WILL: schema, seed generator, event ingest
  contracts.ts          ← WILL writes, everyone imports — THE shared types
components/             ← shared UI (badges, cards); first-needer builds it
```

**Merge rule:** you own your directories; touching someone else's requires a shout in the room. `lib/contracts.ts` changes require all three heads up.

---

## Card A — WILL: the engine, the data, the contracts

**Mission:** everything that makes "it sees the failure coming" literally true. Nothing you build has a UI; everything the others render comes from you.

**You own:** `lib/engine/`, `lib/data/`, `lib/contracts.ts`, cron/tick wiring, seed script, Claude calls for triage.

**In order:**
1. **(Contract hour) `contracts.ts`:** Order record (id, patient, items[{hcpcs, assetId}], vendorId, urgency, targetAt, state, timestamps{}, risk{score, reasons[], features{}}, pod{photo, condition[]}, pickup{triggeredAt, dueAt}), Vendor (id, name, **connected: bool**, serviceArea, stats{}), Event (eRx-shaped: meta.eventType + payload — mirror the FAQ schemas), the 6-state enum + legal transitions. Draft it, let B/C attack it, freeze by 2:30.
2. **Seed generator:** ~15 patients (CMS diagnosis mix), 3 vendors (1 with `connected:false`), ~50 historical orders with realistic on-time patterns (one vendor degrading on STAT orders — v2 needs something true to find). Deterministic seed so demos repeat.
3. **State machine:** one server function `transition(order, event)` — the only way state changes. Every transition timestamps.
4. **`tick(now)` stages 1–2** (deterministic): time-to-deadline, ETA delta, dispatch silence, **24h** pickup aging, vendor on-time rate. Time is a parameter — never read the clock inside. Flags write their input features.
5. **The demo clock:** speed control that feeds accelerated `now` into the same tick. This is Saturday's whole demo working or not — do it while it's cheap.
6. **Escalations → approval inbox records** (tiered: reversible auto / consequential needs-approve / human-facing never-alone).
7. **(Sat) Stage 3:** Claude triage — computed features in, ranked actions + reasons out, structured output. Then the **rules-only toggle** (skip stage 3, flat thresholds). Then token-cost counter per order.
8. **(Sat) Vendor stats v2:** on-time by order-type/urgency from seed history.

**You provide:** contracts.ts types · seeded DB · `transition()` · tick output (risk flags with why) · inbox records. **You consume:** nothing — you're upstream.
**Not yours:** any page, any pixel, the pitch deck.
**Demo beats you carry:** 3 (At-Risk fires) and 6 (pickup delayed fires). **Q&A you answer:** "what happens when the model is wrong," token cost, "is the risk score real."

---

## Card B — GARRETT: the hospice side and the family page

**Mission:** the screens the judges score hardest (FAQ: judging weight sits primarily hospice-side) and the emotional peak (family page). Dan drives the demo Saturday — your job is that every screen on his click-path is smooth and persona-true.

**You own:** `app/(hospice)/`, `app/f/[token]/`, `app/emr/`.

**In order:**
1. **Patient list → order form** (works one-handed on a phone; admissions nurse will use desktop — responsive, not two builds): equipment picker with HCPCS E-codes (E0250 bed, E1390 O₂, E0601 CPAP…), urgency, target date tied to discharge.
2. **Vendor picker = their three decision factors as three columns:** on-time (in-stock + expected delivery vs. your deadline) · cost · fit (vendor's stats for this order type). Unconnected vendors selectable with a "not yet connected — Handoff still tracks it" note (Will's `connected:false` flag).
3. **Live status board:** one row per open order, lifecycle badge per state (semantic tokens are already in `globals.css` — `bg-status-at-risk` etc.), risk badge opens the "why" panel rendering Will's stored features. This is the single-pane-of-glass — spend polish here.
4. **Approval inbox** (lives in the board, not a separate console): reroute approvals, DON high-cost approvals, family-message approvals. Approve = one tap.
5. **EMR simulator panel** (`/emr`): buttons that emit eRx-shaped events (admit, discharge, **deceased**). Label it "EMR simulator — HCHB/MatrixCare/Netsmart pattern."
6. **Nurse deceased-trigger** (phone): from the patient, one guarded tap → pickup triggered, no phone call. EMR event arrives later as fallback (beat 5's whole point).
7. **(Sat) Family tracker** `/f/[token]`: read-only, calm (cream tint, no status noise): "Your hospital bed arrives today 2–4 PM." / "Pickup is scheduled tomorrow at 10 AM. No one needs to be home. We're so sorry for your loss."
8. **(Sat) Family-message approve-send** (Claude drafts, human sends) + **money counter** (24h × CMS daily rates, census roll-up) + DME-next-to-meds cost widget.

**You provide:** the demo click-path screens. **You consume:** contracts.ts, tick flags, inbox records (Will), POD/condition data (Dan).
**Not yours:** vendor screens, the engine, the integration diagram, the pitch.
**Demo beats you build:** 1, 3 (UI), 5, 6 (UI). **Q&A you answer:** persona questions ("which persona is this screen for?").

---

## Card C — DAN: the vendor side, proof surfaces, demo assets, the pitch

**Mission:** the no-login vendor experience (the FAQ's named bonus path) and every artifact judges take home. You drive the demo and pitch Saturday — the demo script, backup video, and differentiation page are yours end-to-end.

**You own:** `app/v/[token]/`, POD/condition capture, SLA scorecard, Deliverable C page, integration diagram, backup video, the demo script + pitch.

**In order:**
1. **Magic-link vendor route** `/v/[token]`: no account, no login — token resolves to vendor context. Phone-first, dispatcher-in-a-truck ergonomics.
2. **Queue → accept → assign route/ETA:** incoming orders with urgency + deadline visible; accept sets ETA (feeds Will's risk math).
3. **Status updates:** dispatched → in-transit → delivered, one tap each. Every tap timestamps (feeds SLA stats).
4. **POD capture:** photo + signature + timestamp, **plus the 3-item condition checklist** (clean / functional / complete) — the FAQ's "strong differentiator." Same pattern on pickup (condition-on-return).
5. **Pickup queue:** triggered pickups with the **24h clock visible** — dispatcher sees what's aging.
6. **(Sat) SLA scorecard** per vendor: on-time %, avg pickup time, POD completeness — rendered from Will's stats. Plus serialized-inventory lite: assets in / deployed / **overdue** (the overdue view doubles as pickup-delay data).
7. **(Sat) Deliverable C — differentiation snapshot page** (`/why` or in the README): the comparison table from [`market-research.md`](https://github.com/gobixplr-svg/ai-builder-day-2/blob/main/prep/betterrx/market-research.md) — benefit managers vs. single-vendor portals vs. EMR pass-throughs vs. Handoff.
8. **(Sat) Integration diagram** (eRx events + HCHB/MatrixCare/Netsmart ADT, the FAQ payload shapes, forward-compatible inventory interface) + **backup video at freeze** + demo-device prep (your phone is the vendor phone in the demo).

**You provide:** ETA + status timestamps + POD/condition data, and the pitch itself. **You consume:** contracts.ts, seeded vendors, pickup jobs (Will).
**Not yours:** hospice screens, engine internals.
**Demo beats you build:** 2 and 4 (and you narrate all six). **Q&A you answer:** "why would a vendor adopt this," the differentiation table, the close, the "you won last time" question.

---

## The seams (where two lanes touch — check these at every standup)

1. **Order form → queue** (Garrett → Dan, via Will's `transition()`): the Fri 5:00 checkpoint.
2. **ETA set → risk flag** (Dan → Will → Garrett): the Fri-night checkpoint.
3. **Deceased trigger → pickup job → pickup queue** (Garrett → Will → Dan): Sat-morning checkpoint.
4. **Inbox approve → action executes** (Garrett's UI → Will's engine): needed before beat 3 demos.

Standups 5:00 / 8:00 / Sat 9:00 — walk the seams, not the features.
