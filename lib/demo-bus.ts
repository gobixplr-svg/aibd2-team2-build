"use client";

// Same-browser event bus (localStorage) so demo surfaces react to each
// other live — /emr marks a patient deceased, an open /board updates.
// TEMPORARY: replaced by the real store when Postgres lands (Will).
// Cross-device sync is out of scope until then.

import { useEffect } from "react";
import type { HandoffEvent } from "@/lib/contracts";

const KEY = "handoff-demo-events";

export function emitDemoEvent(event: HandoffEvent) {
  try {
    const log: HandoffEvent[] = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    log.push(event);
    localStorage.setItem(KEY, JSON.stringify(log.slice(-50)));
  } catch {
    /* demo-only best effort */
  }
}

export function useDemoEvents(handler: (e: HandoffEvent) => void) {
  useEffect(() => {
    function onStorage(ev: StorageEvent) {
      if (ev.key !== KEY || !ev.newValue) return;
      try {
        const log: HandoffEvent[] = JSON.parse(ev.newValue);
        const last = log[log.length - 1];
        if (last) handler(last);
      } catch {
        /* ignore */
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [handler]);
}
