// ─────────────────────────────────────────────────────────────
// The demo clock. Owned by Will (engine lane).
//
// Contract-hour lock #1: tick(now) takes time as a PARAMETER and the
// engine never reads the clock itself. This file is the only place
// that touches Date.now(), and it does so behind one function.
//
// Why it matters: every time-based thing we pitch — risk firing
// before a 4:30 PM discharge, the 24-hour pickup SLA aging out,
// after-hours coverage — is unshowable at 2:15 PM on Saturday unless
// we can turn time faster. The alternative is hardcoding the demo,
// and the runbook promises "nothing is hardcoded to fire on cue."
//
// On stage the answer to "is this real?" is: identical function,
// we're just turning time faster — here's the cron that calls it
// every five minutes in production.
// ─────────────────────────────────────────────────────────────

import type { World, WorldClock } from "@/lib/contracts";
import { getWorld, putWorld } from "@/lib/data/db";

/**
 * Virtual time, given a clock and the real wall time.
 *
 * Pure — no I/O, no Date.now(). Anchored rather than accumulated so
 * that changing speed never makes time jump: we record where the two
 * timelines met, then project forward from there.
 */
export function virtualNow(clock: WorldClock, realNowMs: number): number {
  if (!clock.anchorRealMs) return realNowMs + clock.offsetMs;
  return clock.anchorVirtualMs + (realNowMs - clock.anchorRealMs) * clock.speed;
}

/** Re-anchor at the current instant, then apply a new speed. */
export function withSpeed(
  clock: WorldClock,
  speed: number,
  realNowMs: number,
): WorldClock {
  return {
    ...clock,
    speed,
    anchorRealMs: realNowMs,
    anchorVirtualMs: virtualNow(clock, realNowMs),
  };
}

/** Jump virtual time forward (or back) without changing speed. */
export function withJump(
  clock: WorldClock,
  deltaMs: number,
  realNowMs: number,
): WorldClock {
  return {
    ...clock,
    anchorRealMs: realNowMs,
    anchorVirtualMs: virtualNow(clock, realNowMs) + deltaMs,
  };
}

/** A clock pinned to real time, anchored now. Used by reset. */
export function freshClock(realNowMs: number): WorldClock {
  return {
    offsetMs: 0,
    speed: 1,
    anchorRealMs: realNowMs,
    anchorVirtualMs: realNowMs,
  };
}

// ── The one impure edge ──────────────────────────────────────

/**
 * Engine time, right now. The ONLY place Date.now() is read.
 *
 * Everything downstream — tick(), the seed generator, SLA math —
 * receives this as an argument so it stays testable and repeatable.
 */
export async function engineNow(): Promise<number> {
  const world = await getWorld();
  return virtualNow(world.clock, Date.now());
}

export async function engineNowWithWorld(): Promise<{
  now: number;
  world: World;
}> {
  const world = await getWorld();
  return { now: virtualNow(world.clock, Date.now()), world };
}

/** Set speed (1 = real time, 60 = a minute per second) and persist. */
export async function setSpeed(speed: number): Promise<World> {
  const world = await getWorld();
  return putWorld({ ...world, clock: withSpeed(world.clock, speed, Date.now()) });
}

/** Jump the world forward by N virtual hours. */
export async function jumpHours(hours: number): Promise<World> {
  const world = await getWorld();
  return putWorld({
    ...world,
    clock: withJump(world.clock, hours * 3_600_000, Date.now()),
  });
}
