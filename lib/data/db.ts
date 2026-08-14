// ─────────────────────────────────────────────────────────────
// The store. Owned by Will (engine lane).
//
// Every table is a document table — `id text primary key, data jsonb`.
// Types come from lib/contracts.ts, NOT from the database. That's
// deliberate: the contract will move a few more times before Saturday
// and we cannot afford a migration each time.
//
// Two backends, chosen by environment:
//   · DATABASE_URL set  → Neon Postgres. Shared across devices. The demo.
//   · DATABASE_URL unset → in-process memory. Local dev only.
//
// The memory backend REFUSES to start on Vercel. Two devices hitting
// serverless with per-instance memory silently split-brain — the vendor's
// phone and the hospice board would show different worlds mid-demo. Better
// to fail loudly at boot than to discover that on stage.
// ─────────────────────────────────────────────────────────────

import { neon } from "@neondatabase/serverless";
import type {
  Calibration,
  HandoffEvent,
  InboundMessage,
  InboxItem,
  Order,
  Outcome,
  Patient,
  TokenLedgerEntry,
  Vendor,
  World,
} from "@/lib/contracts";
import { DEFAULT_POLICY } from "@/lib/contracts";

const WORLD_ID = "singleton";

export const DEFAULT_WORLD: World = {
  clock: { offsetMs: 0, speed: 1, anchorRealMs: 0, anchorVirtualMs: 0 },
  policy: DEFAULT_POLICY,
};

// ── Backend selection ────────────────────────────────────────

const url = process.env.DATABASE_URL;
const onVercel = Boolean(process.env.VERCEL);

if (!url && onVercel) {
  throw new Error(
    "DATABASE_URL is not set on Vercel. The in-memory fallback is refused here " +
      "because serverless instances do not share memory — the hospice board and " +
      "the vendor phone would diverge mid-demo. Add DATABASE_URL in Vercel settings.",
  );
}

const sql = url ? neon(url) : null;

/** True when running against real Postgres. Surfaced in /api/state for the demo checklist. */
export const isPersistent = Boolean(sql);

// ── In-memory fallback (local dev only) ──────────────────────

type Row = { id: string; data: unknown };
const mem = new Map<string, Map<string, Row>>();
const memSeq = new Map<string, unknown[]>();

function memTable(name: string) {
  let t = mem.get(name);
  if (!t) mem.set(name, (t = new Map()));
  return t;
}
function memLog(name: string) {
  let l = memSeq.get(name);
  if (!l) memSeq.set(name, (l = []));
  return l;
}

// ── Schema ───────────────────────────────────────────────────

const DOC_TABLES = [
  "orders",
  "patients",
  "vendors",
  "inbox",
  "outcomes",
  "messages",
  "world",
] as const;

const LOG_TABLES = ["events", "ledger"] as const;

let schemaReady: Promise<void> | null = null;

/** Idempotent. Safe to call on every request; the promise is memoised per instance. */
export function ensureSchema(): Promise<void> {
  if (!sql) return Promise.resolve();
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    for (const t of DOC_TABLES) {
      await sql.query(
        `create table if not exists ${t} (id text primary key, data jsonb not null)`,
      );
    }
    for (const t of LOG_TABLES) {
      await sql.query(
        `create table if not exists ${t} (seq bigserial primary key, data jsonb not null)`,
      );
    }
    // Pickup aging and deadline math scan open orders on every tick.
    await sql.query(
      `create index if not exists orders_state_idx on orders ((data->>'state'))`,
    );
  })();
  return schemaReady;
}

// ── Generic document access ──────────────────────────────────

async function all<T>(table: string): Promise<T[]> {
  if (!sql) return [...memTable(table).values()].map((r) => r.data as T);
  await ensureSchema();
  const rows = (await sql.query(`select data from ${table}`)) as { data: T }[];
  return rows.map((r) => r.data);
}

async function one<T>(table: string, id: string): Promise<T | null> {
  if (!sql) return (memTable(table).get(id)?.data as T) ?? null;
  await ensureSchema();
  const rows = (await sql.query(`select data from ${table} where id = $1`, [
    id,
  ])) as { data: T }[];
  return rows[0]?.data ?? null;
}

async function put<T extends { id: string }>(
  table: string,
  doc: T,
): Promise<T> {
  if (!sql) {
    memTable(table).set(doc.id, { id: doc.id, data: doc });
    return doc;
  }
  await ensureSchema();
  await sql.query(
    `insert into ${table} (id, data) values ($1, $2::jsonb)
     on conflict (id) do update set data = excluded.data`,
    [doc.id, JSON.stringify(doc)],
  );
  return doc;
}

async function putMany<T extends { id: string }>(
  table: string,
  docs: T[],
): Promise<void> {
  if (docs.length === 0) return;
  if (!sql) {
    for (const d of docs) memTable(table).set(d.id, { id: d.id, data: d });
    return;
  }
  await ensureSchema();
  // One statement — a 50-order seed in a single round trip.
  const ids = docs.map((d) => d.id);
  const blobs = docs.map((d) => JSON.stringify(d));
  await sql.query(
    `insert into ${table} (id, data)
     select * from unnest($1::text[], $2::jsonb[])
     on conflict (id) do update set data = excluded.data`,
    [ids, blobs],
  );
}

async function append<T>(table: string, doc: T): Promise<void> {
  if (!sql) {
    memLog(table).push(doc);
    return;
  }
  await ensureSchema();
  await sql.query(`insert into ${table} (data) values ($1::jsonb)`, [
    JSON.stringify(doc),
  ]);
}

async function readLog<T>(table: string, limit = 500): Promise<T[]> {
  if (!sql) return memLog(table).slice(-limit) as T[];
  await ensureSchema();
  const rows = (await sql.query(
    `select data from ${table} order by seq desc limit $1`,
    [limit],
  )) as { data: T }[];
  return rows.map((r) => r.data).reverse();
}

// ── Typed accessors — what the engine and API routes call ────

export const getOrders = () => all<Order>("orders");
export const getOrder = (id: string) => one<Order>("orders", id);
export const putOrder = (o: Order) => put("orders", o);
export const putOrders = (o: Order[]) => putMany("orders", o);

export const getPatients = () => all<Patient>("patients");
export const getPatient = (id: string) => one<Patient>("patients", id);
export const putPatient = (p: Patient) => put("patients", p);
export const putPatients = (p: Patient[]) => putMany("patients", p);

export const getVendors = () => all<Vendor>("vendors");
export const getVendor = (id: string) => one<Vendor>("vendors", id);
export const putVendor = (v: Vendor) => put("vendors", v);
export const putVendors = (v: Vendor[]) => putMany("vendors", v);

export const getInbox = () => all<InboxItem>("inbox");
export const putInboxItem = (i: InboxItem) => put("inbox", i);
export const putInboxItems = (i: InboxItem[]) => putMany("inbox", i);

export const getMessages = () => all<InboundMessage>("messages");
export const putMessage = (m: InboundMessage) => put("messages", m);

export const appendEvent = (e: HandoffEvent) => append("events", e);
export const getEvents = (limit?: number) =>
  readLog<HandoffEvent>("events", limit);

export const appendLedger = (e: TokenLedgerEntry) => append("ledger", e);
export const getLedger = (limit?: number) =>
  readLog<TokenLedgerEntry>("ledger", limit);

// Outcomes key on orderId, so they get a tiny id shim.
export async function putOutcome(o: Outcome): Promise<void> {
  await put("outcomes", { ...o, id: o.orderId });
}
export const getOutcomes = () => all<Outcome>("outcomes");

// ── World (clock + policy) ───────────────────────────────────

export async function getWorld(): Promise<World> {
  const w = await one<World & { id: string }>("world", WORLD_ID);
  return w ?? DEFAULT_WORLD;
}

export async function putWorld(w: World): Promise<World> {
  await put("world", { ...w, id: WORLD_ID });
  return w;
}

// ── Reset ────────────────────────────────────────────────────

/**
 * Wipe everything. Paired with the seed generator by POST /api/reset.
 *
 * This runs before every rehearsal and before the real demo — a
 * deterministic seed plus a two-second reset is what makes the run
 * repeatable instead of a one-shot we're afraid to touch.
 */
export async function wipe(): Promise<void> {
  if (!sql) {
    mem.clear();
    memSeq.clear();
    return;
  }
  await ensureSchema();
  for (const t of [...DOC_TABLES, ...LOG_TABLES]) {
    await sql.query(`truncate table ${t}`);
  }
}

// ── Calibration ──────────────────────────────────────────────
// Measured precision/recall per reason code. Pure arithmetic over
// recorded outcomes — no model, no training, nothing asserted.

export async function getCalibration(): Promise<Calibration[]> {
  const outcomes = await getOutcomes();
  const byCode = new Map<string, Calibration>();

  const blank = (reasonCode: string): Calibration => ({
    reasonCode: reasonCode as Calibration["reasonCode"],
    flagged: 0,
    trueP: 0,
    falseP: 0,
    missed: 0,
    precision: 0,
    recall: 0,
  });

  for (const o of outcomes) {
    if (o.wasFlagged) {
      for (const code of o.reasonCodes) {
        const c = byCode.get(code) ?? blank(code);
        c.flagged += 1;
        if (o.actuallyLate) c.trueP += 1;
        else c.falseP += 1;
        byCode.set(code, c);
      }
    } else if (o.actuallyLate) {
      // A late order nothing flagged is a miss against every code.
      for (const c of byCode.values()) c.missed += 1;
    }
  }

  for (const c of byCode.values()) {
    const p = c.trueP + c.falseP;
    const r = c.trueP + c.missed;
    c.precision = p ? c.trueP / p : 0;
    c.recall = r ? c.trueP / r : 0;
  }

  return [...byCode.values()].sort((a, b) => b.flagged - a.flagged);
}
