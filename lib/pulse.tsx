"use client";

// Pulse — a wrapper that flashes when what it's watching changes, or
// when it newly appears on an already-live page. Every surface polls
// the same server world (~2s), so this is what makes a state change
// on one screen visibly LAND on the others: the vendor taps Accept,
// the board row glows; Hermes queues an approval, the tray item glows.
// Pure presentation — watch values in, one CSS animation out.

import { useEffect, useRef, useState } from "react";

// Anything mounting in the first seconds is initial render, not news.
const PAGE_LOAD = Date.now();

export function Pulse({
  watch,
  className = "",
  children,
}: {
  watch: unknown;
  className?: string;
  children: React.ReactNode;
}) {
  const [on, setOn] = useState(false);
  const prev = useRef<unknown>(undefined);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      prev.current = watch;
      // Mounted mid-session = genuinely new activity; initial render isn't.
      if (Date.now() - PAGE_LOAD <= 4000) return;
    } else {
      if (Object.is(prev.current, watch)) return;
      prev.current = watch;
    }
    // Deferred — same never-a-sync-setState convention as use-world.ts.
    const on = setTimeout(() => setOn(true), 0);
    const off = setTimeout(() => setOn(false), 2200);
    return () => {
      clearTimeout(on);
      clearTimeout(off);
    };
  }, [watch]);

  return <div className={`${className} ${on ? "pulse-change" : ""}`}>{children}</div>;
}
