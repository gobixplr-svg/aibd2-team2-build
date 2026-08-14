// Moved to lib/data/stub-seed.ts (shared by hospice + vendor surfaces).
// This re-export keeps Garrett's vendor imports working — safe to
// migrate imports to "@/lib/data/stub-seed" and delete this file.

export { STUB_VENDORS, STUB_ORDERS, vendorByToken, vendorById } from "@/lib/data/stub-seed";
