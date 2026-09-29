// Admin order list: every order with its Shopify sync status, and a "Retry"
// action for FAILED ones. The shell and access control live in ../layout.tsx.
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { OrderStatusBadge } from "../_components/order-status-badge";
import { retryOrder } from "./actions";

export const metadata = { title: "Orders — Hubex Admin" };
export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
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
  const failed = orders.filter((o) => o.status === "FAILED").length;

  return (
    <>
      <section className="content-header">
        <div className="container-fluid d-flex align-items-center">
          <h1 className="h4 mb-0">Orders</h1>
          <span className="text-muted ml-3">last {orders.length} shown</span>
        </div>
      </section>

      <section className="content">
        <div className="container-fluid">
          {failed > 0 && (
            <div className="callout callout-danger py-2">
              <b>{failed}</b> failed {failed === 1 ? "order needs" : "orders need"} attention — use{" "}
              <b>Retry</b> to re-queue Shopify submission.
            </div>
          )}

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
                        <OrderStatusBadge status={o.status} />
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
      </section>
    </>
  );
}
