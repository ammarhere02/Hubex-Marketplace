"use client";

// Auto sign-out after 5 minutes of inactivity. The last-activity timestamp
// lives in sessionStorage (per-tab, cleared when the tab closes) so it also
// survives client-side navigations and full reloads: coming back to a tab
// that sat idle past the limit signs out immediately. Storage access is
// wrapped in try/catch — if it's unavailable, the in-memory timer still works
// for the current page. The server session is revoked via the logout API, not
// just the cookie dropped client-side.
import { useEffect } from "react";

const IDLE_LIMIT_MS = 5 * 60 * 1000;
const STORAGE_KEY = "hubex_last_activity";
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;

export function IdleLogout() {
  useEffect(() => {
    let lastActivity = Date.now();
    let done = false;

    try {
      const stored = Number(sessionStorage.getItem(STORAGE_KEY));
      if (stored > 0) lastActivity = stored;
    } catch {}

    const touch = () => {
      lastActivity = Date.now();
      try {
        sessionStorage.setItem(STORAGE_KEY, String(lastActivity));
      } catch {}
    };

    async function signOut() {
      if (done) return;
      done = true;
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {}
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } finally {
        window.location.assign("/login?reason=idle");
      }
    }

    const check = () => {
      if (Date.now() - lastActivity >= IDLE_LIMIT_MS) void signOut();
    };

    touch();
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const interval = window.setInterval(check, 15_000);
    // A tab woken from the background checks immediately instead of waiting
    // for the next interval tick.
    document.addEventListener("visibilitychange", check);

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, touch));
      document.removeEventListener("visibilitychange", check);
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
