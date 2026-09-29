const BADGE: Record<string, string> = {
  PENDING_SYNC: "badge-warning",
  SYNCED: "badge-success",
  FAILED: "badge-danger",
};

export function OrderStatusBadge({ status }: { status: string }) {
  return <span className={`badge ${BADGE[status] ?? "badge-secondary"}`}>{status}</span>;
}
