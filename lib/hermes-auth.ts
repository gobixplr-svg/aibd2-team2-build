// Shared guard for the demo-control surface (tick / clock / reset).
// One rule, stated once: if HERMES_SECRET is set, the request must
// carry it in x-hermes-secret. Unset (local dev) means no lock to pick.
//
// The secret only ever lives server-side. The /control page asks the
// operator to type it once and keeps it in sessionStorage — it is
// never baked into the client bundle.

export function hermesAuthorized(req: Request): boolean {
  const secret = process.env.HERMES_SECRET;
  if (!secret) return true;
  return req.headers.get("x-hermes-secret") === secret;
}
