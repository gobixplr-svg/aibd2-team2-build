# Game-day runbook — Q&A drill, pre-mortem, kickoff script

*Companion to [`team-pitch.md`](team-pitch.md). This is the operational layer: what we say under fire, what kills us, and how the first hour runs.*

## Research-backed tactics (from judge write-ups + serial winners — full sources in the repo history)

1. **Allocate pitch seconds proportional to rubric weight, and say the rubric words out loud.** Judges score what you make scoreable — "what makes this different is…" fills the 30% box while you talk. Our arc audit: differentiation must get ~90s total (positioning line + live cold start + snapshot); it's the biggest box.
2. **First working demo moment inside 90 seconds.** One flow, pre-filled forms, zero stall points. "One 'oh, this is possible now' moment beats a tour of every feature" (JetBrains judging panel).
3. **Backup video queued on the demo machine, and rehearse the fallback *sentence*:** "Wi-Fi isn't cooperating — here's the same flow recorded an hour ago." Calm, not panic. Judges penalize not *having* the video, never using it.
4. **Validation artifacts are the cheapest 25% ammo.** BetterRX handed us theirs: the discovery quotes in the brief ARE the customer interviews. Quote them back verbatim, by title ("your VP of Digital Transformation said: SSO, single pane of glass, one place to do it all — I haven't heard of anyone doing this yet. This is that.").
5. **Defending-champion dynamics (evidence thin but directionally consistent):** judges' expectations rise for known winners, especially on differentiation — a competent retread scores *below* expectations. Never present anything that smells recycled; name the last win before they do, briefly, as compounding insight, not a title defense.
6. **End with a 30-second "Monday plan."** Corporate judges champion projects internally when there's a credible rollout path: "pilot with 2–3 existing eRx hospices and their local vendors in one metro, 90 days, measuring on-time delivery, pickup latency, and family satisfaction — and we're willing to keep working on it." That slide is what an exec forwards to their CEO.
7. **Give each judge one repeatable sentence** — differentiation claim + the money number. Ours: *"Neutral software, not a benefit manager — both sides on one board, risk flagged before it's late, at cents per order."*
8. **Pitch-order effects are real** (field-experiment grade): early slots get scored against an uncalibrated pool and grilled harder; late slots face tired judges — go shorter, more vivid, end on a ≤3-point recap. Adapt on the spot when we learn our slot.
9. **Compliance sentence, unprompted:** "No PHI touches the model — synthetic data only this weekend; in production, de-identification sits here [point at diagram]." Healthcare execs silently score this even though it's not on the rubric.
10. **Sleep is a competitive weapon:** staggered 2–3h blocks Friday night, never three simultaneous all-nighters — post-mortems attribute most final-hours bugs to fatigue, and the pitch owner especially must be sharp for Q&A.
11. **The pitch owner starts drafting the narrative at hour 4, not hour 20** — winners budget ~15% of the clock (≈3.5h of a 24h event) to pitch/demo/rehearsal as a scheduled activity.

## Demo beats — the live click-through (rewritten Fri night against the shipped portal; supersedes the arc paragraph in team-pitch.md)

*The old script referenced screens that no longer exist (bedside-order page, drag-column board). What shipped is the tabbed portal. These beats use only real screens and real button labels. **Still owed: the physical two-device click-through on prod** — run these beats on the Vercel URL with laptop + phone before midnight, then again Sat 9 AM.*

**Rig (before we're on):** From `/control` (key already typed): **Reset world** once, confirm seeded counts. Laptop tab 1 = `/board` (lands on Equipment; Garrett's turn-3 nav is **Equipment / EMR simulator / Family view**, with Equipment owning **Equipment / By patient / Analytics** sub-tabs and approvals in a **global header tray**), tab 2 = `/control`, tab 3 = family page `/f/demo-family`. Phone = vendor magic link `/v/demo-vendor` (Wasatch — always pick Wasatch in beat 2 so the phone matches). Nothing on the demo path leaves our deployment.

1. **0:00 — Cold open, Equipment ▸ By patient.** Census grouped by assets, DME and Rx spend side by side, cost-to-date with idle-rental risk. *"Meds and equipment for every patient, finally on one screen — this is the single pane of glass your VP asked for."* (Analytics sub-tab is the Q&A ammo — cost/patient-day, vendor performance, CSV export — show it only if asked.)
2. **0:15 — AI intake.** New order → paste the prepared referral (it includes a *shower bench* — deliberately not in our catalog) → **Extract**. Point at the per-field confidence chips, then the *"Didn't map: 'shower bench'"* callout: *"When the AI isn't sure, it says so per field — and what it can't map it hands back instead of guessing. A human confirms every field; extraction costs about half a cent."* Confirm patient match, pick the top-ranked vendor, **Place order**.
3. **0:50 — Vendor phone.** Magic link, no account, no install: **Accept order** → in transit. Both screens are the same server world — no smoke, one database.
4. **1:10 — `/control`: speed 60×, Tick now.** Back on the Equipment sub-tab: Hermes flags the discharge-deadline order at-risk **before it's late**, and the card shows the verbatim why — computed numbers plus the ranked triage sentence with its confidence. *"The model receives computed features and returns a choice from a fixed list. It cannot invent a delivery status — that failure mode is closed off architecturally."*
5. **1:35 — Phone: Delivered** with the POD condition checklist. Family tab: *"Your bed has been delivered and set up."*
6. **1:50 — The hard part of hospice.** Equipment ▸ By patient → expand the patient → **Record passing** (its own confirm step) → pickup triggers with a 24h SLA clock. Phone: **Acknowledge pickup**, then **commit a retrieval window** — family tab now shows the window. *"Closed loop: acknowledged, scheduled, completed — nobody in the market closes this loop."*
7. **2:10 — `/control`: +25h, Tick now.** Pickup ladder escalates; the header shows dollars accruing for every extra rental day. **Approvals tray (global header — visible from any tab):** the Claude-drafted family message is waiting — **edit one word live**, then **Approve & send**. If a reroute proposal is also waiting, approve it and glance at the phone: the order actually jumps to the backup vendor's queue. *"Anything a family reads is drafted by AI and sent by a person. Never Hermes alone."*
8. **2:25 — Close on the ledger.** *"Every model call tonight is metered: roughly a cent per at-risk order triaged, half a cent per intake extraction — measured, not estimated. The engine costs nothing when nothing is wrong."*

**Fallback beats (rehearsed, not improvised):** AI down → intake shows *"keyword match only — review carefully"* and the demo continues (say the label out loud — the graceful-fallback FAQ point). Wi-Fi down → backup video sentence from tactic #3. Judges ask "is the tick real?" → show `/control` and say the cron-vs-manual line: same function, we're just turning the clock faster.

## Judge Q&A drill (rehearse Saturday 1:00–1:30, assign owners)

Three BetterRX judges, ~5 min Q&A. Likely questions with our answers:

**"How is this different from Dragonfly / StateServ / Qualis?"** (the differentiation kill-shot — A answers)
They're benefit managers: they insert their network between you and your vendors and take margin on equipment. We're neutral software — your hospices keep their local vendors, both sides get one board. It's the same model as your eRx: you didn't buy pharmacies, you railed the workflow. Dragonfly can auto-trigger a pickup in select EMRs; nobody closes the loop with acknowledged/scheduled/completed states, an SLA clock, and family visibility. Nobody scores an order at-risk *before* it's late — we checked every product in the market.

**"Why would a DME vendor adopt this?"** (C answers)
Day one: order flow with zero setup — magic link, no account, no software purchase. Over time: the SLA scorecard becomes their sales asset ("we hit 96% on-time for STAT orders — here's proof"), the POD trail cuts their documentation denials (15–25% of DME claims deny on documentation), and route-level visibility lowers their cost-to-serve at exactly the moment competitive bidding (Jan 2028 prices) squeezes their FFS margins.

**"What happens when the model is wrong?"** (A answers — this is the nH Predict trap; do not improvise)
The parts that touch safety are deterministic: ETA-vs-deadline math, pickup aging, escalation thresholds. AI never denies, delays, or withholds equipment — it accelerates intake and flags risk. Every extraction shows per-field confidence with the source document beside it, and a human confirms before any order is placed. Low confidence goes to a review queue, not to a guess.

**"What does this cost to run?"** (A answers)
Measured Friday night, from the token ledger (never estimated): triage ≈ **$0.0044–0.0135 per at-risk order** (one batched call ranks the whole interesting set — a tick that finds nothing costs $0), intake extraction ≈ **$0.006 per pasted referral** (drops toward $0.005 with prompt caching), family-message draft in the same range. An order that sails through touches the model once at intake — call it a cent. Framed against what it offsets — coordinator phone time and even one avoided extra rental day per delayed pickup (a bed rents at ~$1.60/day, oxygen ~$2.80/day) — the token cost is noise, and we say the number anyway because that's the assignment.

**"How does this integrate with our eRx / an EMR?"** (C answers, diagram up)
One order-record JSON both ways. EMR side: HCHB's Business Connect pattern — ADT status changes in, order status out; our EMR-simulator panel is that integration made demoable. eRx side: patient-context sharing so DME spend sits next to med spend. No new standard needed — DME has no e-ordering standard (that's why 80% of orders are still manual), so we ride the partner-connection pattern that already exists.

**"Is the risk score real or demo theater?"** (B answers)
V1 is arithmetic and we say so — ETA vs. deadline, pickup age vs. window. V2 is statistical: per-vendor on-time rates by order type/urgency/day-of-week, computed from order history. In the demo the history is synthetic (seeded from CMS distributions), but the pipeline is real: every flag shows its inputs. Nothing is hardcoded to fire on cue.

**"You won last time — what did you learn?"** (whoever's asked — but ideally we name it first, in one line, during the pitch)
Honest numbers beat big claims. Last time we logged every prompt change with measured before/after and told judges where rules beat AI. Same discipline here — our prompt log is in the repo and the risk engine's deterministic core is labeled as such. Framing rule: last win = evidence of execution, said once, without swagger; then pivot immediately to what's *new* here (two-sided network, cold start, family layer). Nothing we show may smell recycled — judges explicitly penalize it.

**"Who owns the IP?" / "What would you do next?"**
IP: per the bounty terms [confirm at 1:15 deep dive]. Next: pilot with 2–3 eRx hospices and their existing vendors in one metro; measure on-time delivery, pickup latency, and family CAHPS-adjacent satisfaction for 90 days; the SLA data accrual is the moat.

## Pre-mortem — "it's Saturday 4:30 PM and we lost because…"

1. **…the demo broke live.** Counter: deployed URL from hour 2, backup video at freeze, and the demo script never depends on venue wifi (local seed data, no external API calls on the demo path).
2. **…we built Ring 3 before Ring 1 was solid.** Counter: rings cut outside-in; Fri 5:00 checkpoint is *order flows hospice→vendor end-to-end* or we descope immediately.
3. **…the state machine grew flags and exceptions until nothing worked.** Counter: the 6 stages are an enum, transitions are one server function, risk is computed *from* state — never new states for edge cases.
4. **…we demoed features instead of the story.** Counter: the demo IS one patient's story; any feature not on that path is shown only if asked in Q&A.
5. **…judges asked one market question we couldn't answer.** Counter: everyone reads `market-research.md` Friday night; the Q&A drill above runs Saturday 1:00.
6. **…we overclaimed an AI capability and got caught.** Counter: the AI defense names its baselines; "synthetic history" is said out loud in the pitch, before they ask.
7. **…three tired people merged three diverged codebases at 11 AM.** Counter: trunk-based, pull every commit, integration checkpoints Fri 5:00 / Fri night / Sat 10:00 — and the person who's freshest at 9 AM drives the final integration, not whoever wrote the most code.
8. **…the 1:15 deep dive contradicted an assumption and we ignored it.** Counter: one person (B) is the designated note-taker at the deep dive; any conflict with our plan gets 10 minutes of explicit re-scoping at 1:45, not a shrug.

## Kickoff script — Friday 2:00–3:00 (the contract-first hour, minute by minute)

- **2:00–2:10** — Read team-pitch.md one-liner + pitch arc aloud. Amend or accept. Vote on the name (60s max).
- **2:10–2:30** — The contract, on a whiteboard/shared doc: order-record JSON (id, patient, items[{hcpcs, asset_id}], vendor, urgency, target_at, state, timestamps{}, risk{score, reasons[]}, pod{}, pickup{}) · route map (~/hospice, ~/vendor/[token], ~/family/[token], ~/admin-emr) · the 6-state enum + who can trigger which transition.
- **2:30–2:45** — Deploy the empty Next.js app to Vercel from the repo. Confirm all three can push→deploy. Seed script stub committed.
- **2:45–3:00** — Lane confirmation (A engine/data · B hospice UI · C vendor UI), first checkpoint restated (Fri 5:00: one order placed on B's form appears in C's queue and advances states), then split.
- **From 3:00** — nobody talks for 90 minutes except blockers. Standups at 5:00, 8:00, and Sat 9:00, five minutes each, demo-narrative first ("can the story click through?"), features second.

## Schedule spine

**Friday night:** staggered sleep — nobody codes past 2 AM; at least one person fresh by 8 AM. **The pitch owner starts drafting the narrative deck/script Friday ~6 PM (hour 4), not Saturday.** Halfway mark (~midnight): **reread the bounty brief top to bottom** against what's built — "surprisingly many submissions miss stated requirements."

**Saturday:**
- 9:00 standup: demo narrative click-through test
- 10:00: full narrative must click end-to-end (descope trigger if not)
- 12:30: **feature freeze** → 1:00 integration freeze → record backup video on the demo machine → build Deliverable C page if not done
- 1:00–1:30: Q&A drill (this doc) + two timed pitch rehearsals (5:00 hard stop — overrunning reads as unprofessional)
- 1:45: at the venue, deployed URL + video both verified on venue wifi *and* hotspot; learn our pitch slot and adapt (late slot → shorter, vivid, 3-point recap)
- 2:00: judging
