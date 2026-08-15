# Pitch script — Sat 2:30 PM, 10:00 slot, three voices

*Written Sat ~11:30 AM against the shipped build (through PR #63), revised for
the confirmed 10-minute slot. Plan lands at ~9:00 — the last minute is buffer;
finishing early into Q&A reads as confidence, overrunning reads unprofessional.
Rehearse at noon, twice, timed. The runbook's Q&A drill and fallback tactics
still apply.*

**Speaker split:** Dan drives the patient journey (Sorensen intake + Checketts
arc, ~4:30 total). Garrett covers analytics + the finance story (~1:45). Will
closes on Today + the overnight heartbeat (~1:30). Dan opens and closes.
Two handoffs, one scripted sentence each.

## Rig (set before we're called)

- From `/stage` (secret already in sessionStorage): **Reset world** → confirm
  45 patients / 1,108 orders seeded. **One "Tick now"** so the board isn't
  sterile. Copy referral button ready.
- Laptop: `/stage` (board + vendor + family panels live). Phone: `/v/demo-vendor`
  (Wasatch — always Wasatch). Backup video queued in a muted tab. `/snapshot`
  in a background tab.
- Heartbeat workflow DISABLED for the pitch window (re-enable after judging).
- Fallback sentence, rehearsed: *"Wi-Fi isn't cooperating — here's the same
  flow recorded an hour ago."*

## The script

### 0:00–0:50 — DAN · Cold open: the problem + the white space

Board on Equipment ▸ **By patient**. Say:

> "Hospices coordinate dying patients' equipment by phone and fax. The players
> who fix it — Dragonfly, StateServ, Qualis — fix it by inserting themselves as
> middlemen who take margin on every bed. We built neutral software instead:
> the same play as your eRx. You didn't buy pharmacies — you railed the
> workflow. This is Handoff: meds and equipment for every patient on one
> screen, the single pane of glass your VP of Digital Transformation said
> nobody's built."

Flash `/snapshot` for five seconds:

> "We checked every product in this market — five white-space claims, each
> mapped to something we'll show you live in the next eight minutes: risk
> flagged *before* it's late, a closed pickup loop, a family layer, both sides
> on one board, and metered AI cost."

(Rubric words out loud, differentiation first — it's the biggest box.)

### 0:50–1:50 — DAN · AI intake (working demo moment inside 90s)

**New order** → paste the Sorensen referral → **Extract**.

> "A real referral, pasted as-is. Claude extracts the order — per-field
> confidence chips, HCPCS codes and the patient matched as enums against live
> data, so the model literally cannot invent a patient. The shower bench it
> couldn't map to a billable code, it hands back instead of guessing. A human
> confirms every field; extraction costs about half a cent. And the compliance
> sentence unprompted: no PHI touches the model — synthetic data this weekend,
> and in production a de-identification layer sits exactly here."

Confirm patient, top-ranked vendor, **Place order**. Glance at phone:

> "Already in the vendor's queue. Note it files below the STAT card — the
> queue sorts by urgency, not arrival."

### 1:50–4:35 — DAN · The Checketts arc (the STAT order, already on the board)

1. **Phone: Accept order** on M. Checketts (bed + oxygen, discharge 4:30 PM).
   Pick the "Today 4–6 PM" ETA. *"Magic link, no account, no install — a
   vendor adopts this in the time it takes to tap a text message."*
2. **Stage bar: 60× + Tick.** Board flags the order **at-risk before it's
   late** — read one verbatim reason line aloud, point at the confidence.
   *"The model receives computed numbers and returns a choice from a fixed
   list. It cannot invent a delivery status — that failure mode is closed off
   architecturally."*
3. Family panel: the delivery line with the ETA. In the tray, the mid-transit
   family draft — **Approve & send** as-is. *"First of two tones you'll hear
   from the same model — this one is logistics: reassuring, concrete, no
   vendor names, no invented times."*
4. Family panel: tap **"Does this time not work? Tell your care team"** →
   pick a slot. *"The family never chases a truck. Their words land in the
   nurse's inbox, triaged by Claude —"* switch to **Approvals tray** —
   *"— and when a person approves, watch the vendor's phone."* **Approve.**
   Phone card pulses with the family's own words. *"Nothing a family writes
   reaches a vendor until a human on the care team approves it. And if the
   vendor's running late, they propose a new time from the same card — the
   family page updates the moment they do."*
5. **Phone: Mark delivered** + POD photo and condition checklist. Family line
   flips to "delivered and set up." *"Proof of delivery with condition — that
   trail is what cuts a vendor's documentation denials."*
6. **Record passing** (its own confirm step). Slow down, quieter:
   *"This is the part of hospice nobody demos. The bed has to leave the home,
   and the family should never have to ask twice."* Pickup triggers with the
   24h SLA clock. **Phone: Acknowledge → commit a retrieval window.** Family
   page shows the window: no one needs to be home.
7. **Stage bar: +25h + Tick.** The ladder escalates; header dollars accrue —
   point at them. In the tray: the Claude-drafted **condolence** — the second
   tone. **Edit one word live** → **Approve & send** → it appears on the
   family page. *"Same model, completely different register — and a person
   read it first. Never Hermes alone."*
8. If Hermes also proposed a reroute on the delayed pickup: **Approve it**,
   glance at the phone — the order jumps to the backup vendor's queue.
   *"Approvals execute. That queue change was real."*

Handoff line: *"Every step you just watched was also a cost event — Garrett."*

### 4:35–6:20 — GARRETT · Analytics + the finance story

Equipment ▸ **Analytics**. Work the shared filter bar: toggle a vendor chip,
switch equipment type, show monthly spend by vendor across a year.

> "A year of order history behind these charts — synthetic, seeded from CMS
> rate distributions, and we say that out loud — but the pipeline is real:
> every number traces to order records, and every risk flag you saw shows its
> inputs. Cost per patient-day, vendor on-time by urgency, most-ordered
> equipment, month over month by vendor — reporting a hospice CFO has never
> had for DME, sitting next to Rx spend rather than in a silo, which is a
> required feature of this bounty and we built it as one."

Detach one chart's filter (the Power-BI-style override) for ten seconds:

> "Two slices side by side — compare one vendor's oxygen business against the
> fleet without losing the page filter."

Then the money frame:

> "A bed rents at about $1.60 a day, oxygen $2.80 — and the hospice pays until
> retrieval. That idle-rental counter Dan showed ticking upward is the leak,
> measured in dollars. Against that, the AI running all of this — [**Ledger**
> button] — is metered, not estimated: about a cent per at-risk order triaged
> in one batched call, half a cent per intake, and a tick that finds nothing
> costs exactly zero. The engine is noise against one avoided rental day per
> patient."

Handoff line: *"And every morning, all of it lands in one place — Will."*

### 6:20–7:50 — WILL · Today: the nurse's morning + the night shift

Logo → **Today**. It's sparse. **One tick** (stage bar). Cards populate live:
Act now / Review & send / Watch, approvals resolving inline.

> "Nothing on this screen is hardcoded to fire on cue — one clock tick and
> Hermes ranked the nurse's morning. And it ran all night for real: a 5-minute
> heartbeat hit this deployment unattended — the run history is in our GitHub
> Actions — flagging silently, escalating only what crossed a human-facing
> line. The measure of a good night shift is an empty inbox in the morning.
> Every card here is already an AI workflow: flag, draft, propose, wait for a
> human. That's the roadmap answer too — new workflows are new cards on this
> screen, same approval spine, same audit trail."

### 7:50–9:00 — DAN · Close: Monday plan + recap

> "Where this goes Monday: pilot with two or three of your eRx hospices and
> their existing local vendors in one metro, 90 days — measuring on-time
> delivery, pickup latency, and family satisfaction. Vendors join for free
> because the SLA scorecard becomes their sales asset; the data that accrues
> is the moat. We'd keep working on this.
>
> Three things to remember: both sides on one board. Risk flagged before it's
> late. And a human approves everything a family ever reads.
> **Neutral software, not a benefit manager — at cents per order.**"

Stop. (~9:00. The last minute is buffer — absorb a stumble, or hand it to
questions early.)

## Cut lines if running long (in cut order)

1. Arc beat 8 (reroute execute) — it's Q&A ammo anyway.
2. Garrett's detached-filter moment — one chart, one sentence.
3. The `/snapshot` flash — the claims are spoken either way.
4. Arc beat 3 (mid-transit tone) — keep the conflict beat; one tone survives.
   **Never cut:** Record passing, the condolence approve, the Today tick, the
   closing recap.

## If our slot runs late in the day (tired judges)

Go shorter and vivid (runbook tactic #8): open with the 40-second video as the
hook, Dan does ONLY the passing→pickup→condolence arc live (2:00), Garrett
does the ledger + money frame (1:00), Will ticks Today once (0:45), close with
the 3-point recap. Total ~5:00 even in a 10:00 slot — leave the rest for Q&A,
where the drill answers live.

## Fallbacks (rehearsed, not improvised)

- **Wi-Fi dies:** the sentence, then the video, calm.
- **AI down:** intake shows "keyword match only — review carefully" — say the
  label out loud; it's the graceful-fallback FAQ point.
- **"Is the tick real?"** Show the stage bar: same engine function, we're
  turning the clock faster. The overnight cron run history is in GitHub
  Actions — offer to open it.
- **Reroute question:** Request reroute stages an approval; Approve executes
  it and the order jumps queues on the phone. (Don't tap it twice — each tap
  files a separate approval.)
