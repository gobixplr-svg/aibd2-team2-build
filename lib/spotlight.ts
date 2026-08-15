"use client";

// Stage spotlight — /stage tells the board iframe which control the
// current beat is about, and the board rings it in amber and scrolls it
// into view. Elements opt in with data-spotlight="name"; /stage sends
// {type: "hf-spotlight", target: "name"} via postMessage on beat change.
// Pure presentation: no state, no effect on the world.

import { useEffect } from "react";

export function useSpotlight() {
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { type?: string; target?: string } | null;
      if (d?.type !== "hf-spotlight" || typeof d.target !== "string") return;
      if (!/^[a-z0-9-]+$/.test(d.target)) return;

      // The target may be on a sub-tab that's still mounting — retry briefly.
      let tries = 0;
      const attempt = () => {
        const el = document.querySelector<HTMLElement>(`[data-spotlight="${d.target}"]`);
        if (!el) {
          if (++tries < 10) setTimeout(attempt, 300);
          return;
        }
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        el.classList.remove("spotlight-on");
        void el.offsetWidth; // restart the animation if it's already ringing
        el.classList.add("spotlight-on");
        setTimeout(() => el.classList.remove("spotlight-on"), 3600);
      };
      attempt();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
}
