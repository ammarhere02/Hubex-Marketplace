"use client";

import { useState } from "react";

export function LogoutButton() {
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      // Full load, not router.refresh(): the session is gone, so land cleanly
      // on the login page instead of soft-refreshing a now-gated route.
      window.location.assign("/login");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="nav-link btn btn-link" onClick={logout} disabled={busy}>
      <i className="fas fa-sign-out-alt mr-1" /> Logout
    </button>
  );
}
