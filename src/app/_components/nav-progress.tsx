"use client";
// Top-of-page progress bar for client-side navigation. Starts when an internal link
// is clicked and finishes once the new route's pathname/search params are committed,
// so a click gives immediate feedback instead of a silent pause.
// The bar state is derived (no setState in effects): "loading" while the route is
// still the one we clicked from, "done" once it has changed.
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function NavProgress() {
  const route = `${usePathname()}?${useSearchParams()}`;
  const routeRef = useRef(route);
  // Route the last navigation started from, plus a counter that remounts the bar per click.
  const [started, setStarted] = useState<{ from: string; n: number } | null>(null);

  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element).closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      setStarted((s) => ({ from: routeRef.current, n: (s?.n ?? 0) + 1 }));
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  const state = !started ? "idle" : started.from === route ? "loading" : "done";
  return <div key={started?.n ?? 0} className={`mm-progress mm-progress-${state}`} aria-hidden />;
}
