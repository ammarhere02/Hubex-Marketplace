"use client";
// While the order is PENDING_SYNC, re-render the server page every few seconds so
// the customer sees SYNCED or FAILED without refreshing. Stops after ~2 minutes.
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const INTERVAL_MS = 2_000;
const MAX_POLLS = 60;

export function StatusPoller() {
  const router = useRouter();
  useEffect(() => {
    let polls = 0;
    const id = setInterval(() => {
      if (++polls > MAX_POLLS) return clearInterval(id);
      router.refresh();
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, [router]);
  return null;
}
