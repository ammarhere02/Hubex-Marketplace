"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.refresh();
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
