# The Hermes heartbeat — setup and operations

**Owner:** Will (engine) · **Needs from Dan:** one repo secret, one workflow file
**Status:** engine ready (PR #23), workflow blocked on a token scope

---

## Why this exists

`tick(now)` takes time as a parameter and never reads the clock itself. That's
what lets a cron and the `/control` panel drive the *identical* function — one
with real time, one with demo time.

Without a schedule, the honest answer to the judges' question *"what happens when
nobody's logged in?"* is **"nothing."** The engine only ever runs when someone
presses a button. With a schedule, the answer is a run history you can scroll:
every five minutes since Friday night, including at 2 AM.

The whole differentiation story rests on this. `market-research.md` white space
#3: zero incumbents score fulfillment risk *before* it's late. That claim is only
true if something is watching.

---

## Do these in order

### 1. Merge PR #23 first — this one is not optional

**Do not enable the schedule before #23 is on `main`.** It fixes two bugs that
only appear when something runs the tick repeatedly, which is exactly what a cron
does.

Four identical ticks on the old code, with nothing changing between them:

```
tick 1  aiUsed=true  inboxCreated=4  $0.01791
tick 2  aiUsed=true  inboxCreated=2  $0.02210
tick 3  aiUsed=true  inboxCreated=1  $0.02235
tick 4  aiUsed=true  inboxCreated=2  $0.01855
```

- **Stage 3 re-ran every beat.** At 5-minute cadence that's ~288 Claude calls a
  day, roughly **$5/day to sit still** — and it made the Deliverable B claim
  *false*. "Cost scales with at-risk orders, not tick frequency" wasn't true;
  it scaled with both. Overnight was the expensive case, not the free one.
- **The inbox grew forever.** Dedup keyed on `(orderId, proposedAction)`, but
  stage 3 legitimately picks a slightly different action on a re-rank, so the key
  changed and a second row appeared for the same problem.

After #23:

```
tick 1  aiUsed=true   inboxCreated=4  $0.01799
tick 2  aiUsed=true   inboxCreated=0  $0.02156   ← state genuinely changed
tick 3  aiUsed=false  inboxCreated=0  $0         unchanged_since_last_tick
tick 4  aiUsed=false  inboxCreated=0  $0
tick 5  aiUsed=false  inboxCreated=0  $0
tick 6  aiUsed=false  inboxCreated=0  $0
```

Six beats, two calls, four stable rows, then nothing. A `+25h` clock jump still
re-triages correctly — it reacts to real change, it just stops paying to re-read
a world that hasn't moved.

### 2. Add the repo secret

**Settings → Secrets and variables → Actions → New repository secret**

| Name | Value |
|---|---|
| `HERMES_SECRET` | the same value as the Vercel env var |

The workflow fails loudly with a clear error if it's missing, rather than
silently 403-ing every five minutes forever.

### 3. Add the workflow file

Full contents below. It's already written and tested locally at
`.github/workflows/heartbeat.yml` in Will's working tree, but **his OAuth token
lacks `workflow` scope**, so GitHub rejects the push. Either Dan commits this, or
Will runs `gh auth refresh -s workflow` and pushes it himself.

```yaml
name: Hermes heartbeat

on:
  schedule:
    # Shipped as 2-57/5, not */5: GitHub starves new workflows on
    # high-contention minutes — */5 never fired in its first two hours;
    # the off-minutes schedule fired within the hour. Same 5-min cadence.
    - cron: "2-57/5 * * * *"
  workflow_dispatch:

concurrency:
  group: hermes-heartbeat
  cancel-in-progress: false

jobs:
  tick:
    runs-on: ubuntu-latest
    timeout-minutes: 3
    steps:
      - name: Beat
        env:
          SECRET: ${{ secrets.HERMES_SECRET }}
          APP: https://aibd2-team2-build.vercel.app
        run: |
          if [ -z "$SECRET" ]; then
            echo "::error::HERMES_SECRET is not set in repo secrets — the guard will 403."
            exit 1
          fi

          body=$(curl -sS --max-time 60 --retry 2 --retry-delay 5 \
            -X POST "$APP/api/tick" \
            -H "x-hermes-secret: $SECRET" \
            -w '\n%{http_code}')

          code=$(printf '%s' "$body" | tail -n1)
          json=$(printf '%s' "$body" | sed '$d')

          echo "$json"

          if [ "$code" != "200" ]; then
            echo "::error::tick returned HTTP $code"
            exit 1
          fi

          scanned=$(printf '%s' "$json"     | sed -n 's/.*"scanned":\([0-9]*\).*/\1/p')
          interesting=$(printf '%s' "$json" | sed -n 's/.*"interesting":\([0-9]*\).*/\1/p')
          ai=$(printf '%s' "$json"          | sed -n 's/.*"aiUsed":\([a-z]*\).*/\1/p')
          cost=$(printf '%s' "$json"        | sed -n 's/.*"costUsd":\([0-9.]*\).*/\1/p')

          echo "### Hermes beat" >> "$GITHUB_STEP_SUMMARY"
          echo "" >> "$GITHUB_STEP_SUMMARY"
          echo "| scanned | interesting | AI | cost |" >> "$GITHUB_STEP_SUMMARY"
          echo "|---|---|---|---|" >> "$GITHUB_STEP_SUMMARY"
          echo "| ${scanned:-?} | ${interesting:-?} | ${ai:-?} | \$${cost:-0} |" >> "$GITHUB_STEP_SUMMARY"
```

### 4. Fire one by hand and check it

**Actions → Hermes heartbeat → Run workflow.** Don't wait for the schedule —
GitHub's cron is best-effort and can lag several minutes under load.

A healthy run prints something like:

```json
{"ok":true,"scanned":7,"interesting":4,"aiUsed":true,"tokensUsed":1647,"costUsd":0.01745}
```

and writes a summary row on the run page.

---

## Why GitHub Actions

| option | verdict |
|---|---|
| **GitHub Actions** | Chosen. Dan's deploy pipeline already lives here, no new account, no new env var beyond the secret. |
| Vercel cron | Hobby plan fires **once per day**. Wouldn't visibly run all weekend. |
| Trigger.dev | Nicest run-history UI, but a new service and another credential for a weekend build. |

Note GitHub's scheduled runs are **best-effort** — they can drift by several
minutes when the platform is busy, and they're occasionally skipped entirely.
Fine for a heartbeat whose whole point is "roughly every five minutes." Not fine
if you need a beat at an exact second on stage — use `/control` for that.

---

## Operating it

### Demo day

**One beat will probably fire during the 5-minute pitch.** Ticks are idempotent
so it can't corrupt anything, but if the clock is set to 60× it will see a lot of
virtual time pass mid-sentence. Two options:

- **Recommended:** disable the workflow for the pitch window (Actions → Hermes
  heartbeat → ⋯ → Disable workflow) and drive beats manually from `/control`.
  Re-enable straight after — the run history is the artifact, and a gap of twenty
  minutes doesn't hurt it.
- Or leave it on and reset immediately before presenting, so the world is in a
  known state and one extra beat changes little.

**Always `POST /api/reset` before a rehearsal or the real run.** The seed is
deterministic, so the world comes back byte-identical every time. That's what
makes rehearsing safe rather than something to be nervous about.

### What it costs to leave running

With #23 merged, an unchanged world costs **nothing** — stage 3 is skipped
entirely and the beat reports `fallbackReason: "unchanged_since_last_tick"`.
Cost appears only when the flagged set actually changes. Overnight with a static
world is $0; a busy day is a few cents.

If you ever see cost accruing on every beat with nothing happening, that's the
memoisation failing — check `World.lastTriage` is being written.

### What it will and won't do

**Will:** scan open orders, compute risk features, transition states, rank with
Claude when something genuinely changed, and queue tiered actions into the inbox.
Unattended, at 2 AM.

**Won't:** actually contact anyone. A "nudge vendor" is an inbox row that *says* a
reminder was sent — there's no SMS or email integration. Hermes detects, ranks
and queues; reaching outside the app is the interface we sketch, not something
built this weekend. **Say it that way if a judge asks** — the brief only requires
a credible integration approach, and over-claiming here is the one thing that
would actually cost us.

---

## When it breaks

| symptom | cause | fix |
|---|---|---|
| Every run fails, `HTTP 403` | `HERMES_SECRET` missing or doesn't match Vercel | Re-add the secret; values must be identical |
| Run fails with the explicit "not set in repo secrets" error | secret never added | Step 2 above |
| `HTTP 500` mentioning `DATABASE_URL` | Neon env var missing in Vercel | Vercel → Settings → Environment Variables |
| Runs green but `aiUsed` always false | `ANTHROPIC_API_KEY` missing, **or** the world genuinely hasn't changed | Check `fallbackReason`: `no_api_key` vs `unchanged_since_last_tick` |
| Cost on every beat, nothing changing | memoisation not working | Confirm #23 is on `main` |
| Nothing runs at all | GitHub disables schedules on repos with no activity for 60 days | Not a weekend concern |

**The single most useful diagnostic** is `fallbackReason` in the tick response.
It names exactly why stage 3 didn't run: `no_api_key`, `rules_only_toggle`,
`unchanged_since_last_tick`, `refusal`, `error:*`.

---

## Still open

Nobody has walked all six demo beats against **production with Neon behind it**.
Everything above is verified locally against the in-memory store, which is a
different code path. Worth doing before Saturday 10:00 — it's a larger risk than
any remaining feature.
