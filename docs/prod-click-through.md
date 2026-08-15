# Prod click-through — the 8 demo beats, on real devices

The one mandatory test before Saturday. Garrett's turn-3 UI has never been
browser-tested and nobody has walked the beats against prod-with-Neon (local
dev uses the in-memory store — a different code path). Run it tonight, and
again Sat 9 AM per the runbook.

**Anyone on the team can run this.** Post results in Discord as you go —
beat number, ✅/❌, screenshot if ❌ plus what you expected vs. saw.

**Fastest way: run the beats on [`/stage`](https://aibd2-team2-build.vercel.app/stage)** —
all three surfaces in one tab, the referral behind a Copy button, and the
time jumps as one-button beats in the director bar (unlock it with the
Hermes secret, same sessionStorage key as `/control`). The device rig below
still matters for the physical phone moment and Sat-morning verification.
Note: Equipment now has FOUR sub-tabs (Equipment / By patient / On-hand /
Analytics) — On-hand is the consignment-stock answer to the "serialized
inventory" required feature, Q&A ammo.

## Before you start — coordination rule

**Announce in Discord and wait for an ack before you begin. One runner at a
time.** Reset world wipes prod state for everyone, and two people clicking
through simultaneously will trample each other's beats. The 5-minute
heartbeat cron may fire mid-run — that's fine and expected (ticks are
idempotent); don't be startled if the inbox gains a row you didn't cause.

## Rig

| device | open |
|---|---|
| Laptop tab 1 | `https://aibd2-team2-build.vercel.app/board` |
| Laptop tab 2 | `/control` — type the Hermes secret once (value in team chat, never commit it) |
| Laptop tab 3 | `/f/demo-family` |
| Phone | `/v/demo-vendor` |

**Always pick Wasatch as the vendor in beat 2** so the phone's queue matches.

## The referral to paste in beat 2

Written against the seeded census and catalog: `Sorensen, L.` matches
patient p3, the bed / concentrator / portable O2 map to real HCPCS items,
the 10 AM deadline feeds `targetHoursFromNow`, and the shower bench is
deliberately NOT in the catalog so the "Didn't map" callout fires.

```
REFERRAL — Mountain View Regional Medical Center · Discharge Planning
Pt: Sorensen, L. — hospice, discharging home to spouse's care

DME needed IN HOME BEFORE discharge, no later than 10:00 AM tomorrow.
Per Dr. Patel:
  - Semi-electric hospital bed w/ rails, adjustable head
  - Oxygen concentrator, 2L continuous; portable O2 for transport home
  - Shower bench for bathroom safety per PT eval

Stairs at front entry — delivery crew should call ahead.
```

## The beats

Each beat: **do** the steps, then check every **expect** box. Anything
unexpected: screenshot it, note expected-vs-actual, keep going unless the
flow is actually blocked.

### 1 · Cold open
**Do:** `/control` → Reset world → confirm. Switch to `/board`.
**Expect:**
- [ ] Board lands on **Equipment**; nav reads Equipment / EMR simulator / Family view
- [ ] Equipment sub-tabs: Equipment / By patient / Analytics; approvals tray in the global header
- [ ] **By patient**: census grouped by assets, DME and Rx spend side by side, cost-to-date
- [ ] **Analytics** has data (cost/patient-day, vendor performance, CSV export) — Q&A ammo, must not be blank

### 2 · AI intake
**Do:** New order → paste the referral above → **Extract**. Review, confirm patient, pick **Wasatch**, Place order.
**Expect:**
- [ ] Patient matched to **L. Sorensen** (not guessed onto a similar name)
- [ ] Per-field confidence chips render
- [ ] **"Didn't map: 'shower bench'"** callout appears
- [ ] Extraction cost shown (~half a cent)
- [ ] Order appears on the board after placing

### 3 · Vendor phone
**Do:** Phone → **Accept order**.
**Expect:**
- [ ] Order moves to in-transit
- [ ] Laptop board reflects it **without a manual refresh**

### 4 · Risk fires before it's late
**Do:** `/control` → speed **60×** → **Tick now**. Back to Equipment tab.
**Expect:**
- [ ] The discharge-deadline order is flagged at-risk
- [ ] Card shows computed numbers + ranked triage sentence **with confidence** (the verbatim why)

### 5 · Delivery
**Do:** Phone → **Delivered** → POD condition checklist. Check family tab.
**Expect:**
- [ ] POD checklist works on the phone
- [ ] Family tab shows the delivered/set-up message

### 6 · The hard part of hospice
**Do:** Equipment ▸ By patient → expand the patient → **Record passing** → its own confirm step. Phone: **Acknowledge pickup** → **commit a retrieval window**.
**Expect:**
- [ ] Pickup triggers with a **24h SLA clock**
- [ ] Family tab shows the committed window

### 7 · Escalation + human approval — ⚠️ the big one
**Do:** `/control` → **+25h** → **Tick now**. Open the approvals tray (global header). Edit one word of the family draft, **Approve & send**. If a reroute proposal is waiting, approve it too and glance at the phone.
**Expect:**
- [ ] Pickup ladder escalated; header shows rental dollars accruing
- [ ] **A Claude-drafted family message is waiting in the tray** — this is the open `familyDrafts: 0` watch item from the first prod heartbeat. **If no draft appears, stop and post in Discord immediately** — this blocks the demo's signature beat
- [ ] Edited draft sends; family tab shows the edited text (human's words, not the raw AI draft)
- [ ] Reroute (if present): order jumps to the backup vendor's queue on the phone

### 8 · The ledger close
**Do:** Check the cost/ledger readout.
**Expect:**
- [ ] Per-kind lines visible (triage / intake / drafts) — quote THESE on stage
- [ ] The blended field is now `perOrderTouchUsd` (#26) — never quote it as "per order"

## Fallbacks to rehearse while you're in there (2 min)

- Flip **rules-only** on `/control`, run an intake → expect the *"keyword match
  only — review carefully"* label. Say the label out loud once; it's the
  graceful-degradation FAQ answer. Flip AI back ON when done.
- Judges ask "is the tick real?" → show `/control`, say the line: same
  function, we're just turning the clock faster.

## When you're done

Post in Discord: which beats passed, screenshots of any ❌, and **run
Reset world once more** so the world is clean for the next person.
