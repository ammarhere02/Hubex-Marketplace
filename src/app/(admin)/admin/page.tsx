// Admin dashboard: live counts from MySQL (small-boxes) and the newest orders.
// The shell (sidebar, navbar, access control) lives in layout.tsx.
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { OrderStatusBadge } from "./_components/order-status-badge";

export const metadata = { title: "Dashboard — Hubex Admin" };
export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const [pending, synced, failed, products, recent] = await Promise.all([
    prisma.order.count({ where: { status: "PENDING_SYNC" } }),
    prisma.order.count({ where: { status: "SYNCED" } }),
    prisma.order.count({ where: { status: "FAILED" } }),
    prisma.product.count({ where: { status: "ACTIVE", isRemoved: false } }),
    prisma.order.findMany({
      orderBy: { id: "desc" },
      take: 5,
      select: {
        id: true, publicId: true, status: true, customerName: true,
        total: true, currency: true, shopifyOrderName: true, createdAt: true,
      },
    }),
  ]);

  const boxes = [
    { value: synced, label: "Synced orders", icon: "fa-check-circle", bg: "bg-success", href: "/admin/orders" },
    { value: pending, label: "Pending sync", icon: "fa-hourglass-half", bg: "bg-warning", href: "/admin/orders" },
    { value: failed, label: "Failed orders", icon: "fa-exclamation-triangle", bg: "bg-danger", href: "/admin/orders" },
    { value: products, label: "Active products", icon: "fa-box-open", bg: "bg-info", href: "/products" },
  ];

  return (
    <>
      <section className="content-header">
        <div className="container-fluid">
          <h1 className="h4 mb-0">Dashboard</h1>
        </div>
      </section>

      <section className="content">
        <div className="container-fluid">
          <div className="row">
            {boxes.map((b) => (
              <div key={b.label} className="col-6 col-lg-3">
                <div className={`small-box ${b.bg}`}>
                  <div className="inner">
                    <h3>{b.value}</h3>
                    <p>{b.label}</p>
                  </div>
                  <div className="icon">
                    <i className={`fas ${b.icon}`} />
                  </div>
                  <Link href={b.href} className="small-box-footer">
                    View <i className="fas fa-arrow-circle-right ml-1" />
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Latest orders</h3>
              <div className="card-tools">
                <Link href="/admin/orders" className="btn btn-tool text-primary">
                  All orders <i className="fas fa-angle-right ml-1" />
                </Link>
              </div>
            </div>
            <div className="card-body table-responsive p-0">
              <table className="table table-hover text-nowrap mb-0">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Placed</th>
                    <th>Customer</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Shopify order</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center text-muted py-4">
                        No orders yet.
                      </td>
                    </tr>
                  )}
                  {recent.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <Link href={`/orders/${o.publicId}`}>{o.id}</Link>
                      </td>
                      <td>{o.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                      <td>{o.customerName}</td>
                      <td>
                        {o.total.toFixed(2)} {o.currency}
                      </td>
                      <td>
                        <OrderStatusBadge status={o.status} />
                      </td>
                      <td>{o.shopifyOrderName ?? "—"}</td>
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
