"use client";

// The one client data hook. Polls /api/state (~2s) and exposes engine
// time. Replaces demo-bus/demo-store: state lives server-side now, so
// the hospice board and the vendor phone see the same world.

import { useCallback, useEffect, useRef, useState } from "react";

export function useWorld<T = Record<string, unknown>>(query = "") {
  const [state, setState] = useState<(T & { now: string; ok: boolean }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/state${query}`, { cache: "no-store" });
      const json = await res.json();
      if (!alive.current) return;
      if (json.ok) {
        setState(json);
        setError(null);
      } else setError(json.error ?? "unknown error");
    } catch {
      /* transient poll failure — keep last good state */
    }
  }, [query]);

  useEffect(() => {
    alive.current = true;
    const kick = setTimeout(refresh, 0); // async fetch — never a sync setState
    const id = setInterval(refresh, 2000);
    return () => {
      alive.current = false;
      clearTimeout(kick);
      clearInterval(id);
    };
  }, [refresh]);

  return { state, error, refresh };
}

export async function postJson(url: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}
