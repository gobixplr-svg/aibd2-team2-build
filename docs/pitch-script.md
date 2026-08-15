# Pitch script — Sat 2:30 PM, 5:00 hard stop, three voices

*Written Sat ~11:30 AM against the shipped build (through PR #63). Supersedes
the demo-beats section of `game-day-runbook.md` for the pitch itself; the
runbook's Q&A drill and fallback tactics still apply. Rehearse at noon, twice,
timed.*

**Speaker split:** Dan drives the patient journey (Sorensen intake + Checketts
arc). Garrett covers analytics + the finance story. Will closes on Today.
Two handoffs, one sentence each — no "and now I'll pass it to."

## Rig (set before we're called)

- From `/stage` (secret already in sessionStorage): **Reset world** → confirm
  45 patients / 1,108 orders seeded. **One "Tick now"** so the board isn't
  sterile. Copy referral button ready.
- Laptop: `/stage` (board + vendor + family panels live). Phone: `/v/demo-vendor`
  (Wasatch — always Wasatch). Backup video queued in a muted tab.
- Heartbeat workflow DISABLED (re-enable after judging).
- Fallback sentence, rehearsed: *"Wi-Fi isn't cooperating — here's the same
  flow recorded an hour ago."*

## The script

### 0:00–0:25 — DAN · Cold open (differentiation first — biggest rubric box)

Board on Equipment ▸ **By patient**. Say:

> "Hospices coordinate dying patients' equipment by phone and fax, and the
> existing players fix it by inserting themselves as middlemen who take margin
> on every bed. We built neutral software instead — the same play as your eRx.
> This is Handoff: meds and equipment for every patient on one screen — the
> single pane of glass your VP of Digital Transformation said nobody's built."

(Rubric words said out loud: *what makes this different is we're software, not
a benefit manager.*)

### 0:25–1:05 — DAN · AI intake (first working demo moment inside 90s)

**New order** → paste the Sorensen referral → **Extract**.

> "A real referral, pasted as-is. Claude extracts the order — per-field
> confidence chips, patient matched against the census — and the shower bench
> it couldn't map to a billable code it hands back instead of guessing. A human
> confirms every field. Extraction costs about half a cent. No PHI touches the
> model — synthetic data this weekend; in production de-identification sits
> right here."

Confirm patient, top-ranked vendor, **Place order**. Glance at phone: it's in
the vendor queue.

### 1:05–2:35 — DAN · The Checketts arc (the STAT order, already on the board)

1. **Phone: Accept order** on M. Checketts (bed + oxygen, discharge 4:30 PM).
   Pick the "Today 4–6 PM" ETA. *"Magic link, no login, no install — vendors
   adopt this with zero setup."*
2. **Stage bar: 60× + Tick.** Board flags the order **at-risk before it's
   late** — read one verbatim reason line aloud. *"The model sees computed
   numbers and picks from a fixed action list. It cannot invent a delivery
   status — that failure mode is closed off architecturally."*
3. Family panel: the delivery line with ETA. Tap **"Does this time not work?
   Tell your care team"** → pick a slot. *"The family never chases a truck.
   Their conflict lands in the nurse's inbox, triaged by Claude —"* switch to
   **Approvals tray** — *"— and when a person approves it, watch the vendor's
   phone."* **Approve.** Phone card pulses with the family's own words.
   *"Nothing a family writes reaches a vendor until a human approves it."*
4. **Phone: Mark delivered** + POD photo/condition. Family line flips to
   "delivered and set up."
5. **Record passing** (its own confirm step). Quietly:
   *"This is the part of hospice nobody demos. The bed has to leave the home,
   and the family should never have to ask twice."* Pickup triggers with the
   24h SLA clock. **Phone: Acknowledge → commit a window.** Family page shows
   the window.
6. **Stage bar: +25h + Tick.** Ladder escalates; header dollars accrue.
   In the tray: the Claude-drafted **condolence message** — edit one word
   live → **Approve & send** → it appears on the family page.
   *"Drafted by AI, sent by a person. Never Hermes alone."*

Handoff line: *"Every step you just watched was also a cost event — Garrett."*

### 2:35–3:35 — GARRETT · Analytics + the finance story

Equipment ▸ **Analytics**. Filter bar: toggle a vendor chip, switch equipment
type, show monthly spend by vendor over a year of history.

> "A year of order history — synthetic, seeded from CMS rate distributions, and
> we say that out loud — but the pipeline is real: every number traces to order
> records. Cost per patient-day, vendor on-time by urgency, most-ordered
> equipment. This is the reporting a hospice CFO has literally never had for
> DME, sitting next to Rx spend, not in a silo."

Then the money frame:

> "A bed rents at about $1.60 a day, oxygen $2.80 — and hospices pay until
> retrieval. The idle-rental counter you saw ticking is that leak, measured.
> And the AI that runs all of this? [**Ledger** button] — metered, not
> estimated: about a cent per at-risk order triaged, half a cent per intake, a
> tick that finds nothing costs zero. The engine's cost is noise against one
> avoided rental day."

Handoff line: *"And every morning, all of this lands in one place — Will."*

### 3:35–4:25 — WILL · Today: the nurse's morning

Logo → **Today**. It's sparse. **One tick** (stage bar). Cards populate live:
Act now / Review & send / Watch, approvals resolving inline.

> "Nothing on this screen is hardcoded to fire on cue — one clock tick and
> Hermes ranked the nurse's morning. Every card is already an AI workflow:
> flag, draft, propose, wait for a human. That's the roadmap answer too —
> new workflows are new cards, same approval spine, same audit trail."

### 4:25–5:00 — DAN · Close (Monday plan + the repeatable sentence)

> "Monday: pilot with two or three of your eRx hospices and their existing
> local vendors in one metro, 90 days — measuring on-time delivery, pickup
> latency, and family satisfaction. The SLA data that accrues is the moat.
> One sentence to remember us by: **neutral software, not a benefit manager —
> both sides on one board, risk flagged before it's late, at cents per
> order.**"

## Cut lines if running long (in cut order)

1. Family conflict beat (1:05 #3) — cut to just "family page updates live."
2. Garrett's vendor-chip filter walkthrough — one chart, one sentence.
3. Intake narration trims to the shower-bench sentence only.
   **Never cut:** Record passing, the condolence approve, the Today tick, the
   closing sentence.

## If the pitch slot is late in the order

Go shorter and vivid (runbook tactic #8): open with Will's 40-second video as
the hook, then Dan does ONLY the passing→pickup→condolence arc live (90s),
Garrett does the ledger + money frame (45s), close with the 3-point recap:
*one board both sides · risk flagged before it's late · humans approve
everything a family sees.*

## Fallbacks (rehearsed, not improvised)

- **Wi-Fi dies:** the sentence, then the video, calm.
- **AI down:** intake shows "keyword match only — review carefully" — say the
  label out loud; it's the graceful-fallback FAQ point.
- **"Is the tick real?"** Show the stage bar: same engine function, we're
  turning the clock faster. The 5-min cron ran unattended all night — run
  history is in GitHub Actions.
- **Reroute question:** Request reroute stages an approval; Approve executes
  it and the order jumps queues on the phone. (Don't tap it twice — each tap
  files a separate approval.)
