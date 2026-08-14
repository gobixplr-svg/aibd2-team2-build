# Team 2 — AI Builder Day 2 build repo

**Dan Elggren · Garrett Young · Will Sandburg** · Aug 14–15, 2026

This repo contains **scaffold only** (stock `create-next-app`, zero product code) until the build starts Friday 2:00 PM MDT. First product commit after the starting gun — this history is our "when did we start" answer.

## Before you write a feature

Read these in the [prep repo](https://github.com/gobixplr-svg/ai-builder-day-2), in order:

1. `prep/betterrx/team-pitch.md` — the one-liner, pitch arc, and three rings (or `prep/madethis/` if the 1:00 PM announcement goes that way)
2. `prep/betterrx/game-day-runbook.md` — kickoff script (the 2:00–3:00 contract hour), Q&A drill, pre-mortem
3. `prep/betterrx/build-plan.md` — priority tiers and lanes

**Nobody codes a feature until the order-record JSON contract is agreed (kickoff script, 2:10–2:30).**

## Setup

```bash
npm install
cp .env.example .env.local   # then paste the team API key from team chat
npm run dev
```

- Node ≥ 20 · Next.js (App Router) + TypeScript + Tailwind
- `.env*` is gitignored — **never commit keys**; the shared Anthropic key lives in team chat only
- **Live at https://aibd2-team2-build.vercel.app — every push to `main` auto-deploys.** Demo from this URL all weekend, never localhost.
- ⚠️ **Commit with the email linked to your GitHub account** or Vercel blocks your deploy ("commit author is not a valid email"). Fix, once, inside this repo: `git config user.email "<your-github-email-or-noreply-address>"`

## Working agreement

Small commits straight to `main`, pull before every push, no long-lived branches. Feature freeze Sat 12:30 → backup video → rehearse twice.
