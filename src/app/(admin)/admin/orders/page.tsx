// Admin order list: every order with its Shopify sync status, and a "Retry"
// action for FAILED ones. Access rules match the admin home: anonymous users
// never reach this file (proxy gate), signed-in non-admins get 404.
import Link from "next/link";
import { notFound } from "next/navigation";
import { LogoutButton } from "@/app/_components/logout-button";
import { isAdmin } from "@/lib/auth/admin";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { retryOrder } from "./actions";

export const metadata = { title: "Orders — Hubex Admin" };
export const dynamic = "force-dynamic";

const BADGE: Record<string, string> = {
  PENDING_SYNC: "badge-warning",
  SYNCED: "badge-success",
  FAILED: "badge-danger",
};

export default async function AdminOrdersPage() {
  const user = await getSessionUser();
  if (!isAdmin(user)) notFound();

  const orders = await prisma.order.findMany({
    orderBy: { id: "desc" },
    take: 100,
    select: {
      id: true,
      publicId: true,
      status: true,
      customerName: true,
      city: true,
      total: true,
      currency: true,
      attempts: true,
      shopifyOrderName: true,
      lastError: true,
      createdAt: true,
    },
  });

  return (
    <div className="wrapper">
      <nav className="main-header navbar navbar-expand navbar-dark bg-primary">
        <span className="navbar-brand mb-0 h1 ml-2">
          <b>Hubex</b> Admin
        </span>
        <ul className="navbar-nav ml-auto align-items-center">
          <li className="nav-item d-none d-sm-block">
            <span className="nav-link text-white-50">{user!.email}</span>
          </li>
          <li className="nav-item">
            <LogoutButton />
          </li>
        </ul>
      </nav>

      <div className="content-wrapper p-4" style={{ minHeight: "80vh" }}>
        <div className="d-flex align-items-center mb-3">
          <h1 className="h4 mb-0">Orders</h1>
          <Link href="/admin" className="btn btn-sm btn-outline-secondary ml-auto">
            Back to admin
          </Link>
        </div>

        <div className="card">
          <div className="card-body table-responsive p-0">
            <table className="table table-hover text-nowrap mb-0">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Placed</th>
                  <th>Customer</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>Shopify order</th>
                  <th>Last error</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center text-muted py-4">
                      No orders yet.
                    </td>
                  </tr>
                )}
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/orders/${o.publicId}`}>{o.id}</Link>
                    </td>
                    <td>{o.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                    <td>
                      {o.customerName} <span className="text-muted">({o.city})</span>
                    </td>
                    <td>
                      {o.total.toFixed(2)} {o.currency}
                    </td>
                    <td>
                      <span className={`badge ${BADGE[o.status] ?? "badge-secondary"}`}>{o.status}</span>
                    </td>
                    <td>{o.attempts}</td>
                    <td>{o.shopifyOrderName ?? "—"}</td>
                    <td
                      className="text-truncate text-danger"
                      style={{ maxWidth: 260 }}
                      title={o.lastError ?? undefined}
                    >
                      {o.lastError ?? "—"}
                    </td>
                    <td>
                      {o.status === "FAILED" && (
                        <form action={retryOrder}>
                          <input type="hidden" name="orderId" value={o.id} />
                          <button type="submit" className="btn btn-xs btn-warning">
                            <i className="fas fa-redo mr-1" />
                            Retry
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
