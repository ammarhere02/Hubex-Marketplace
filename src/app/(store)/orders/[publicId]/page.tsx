// Order confirmation. Reads MySQL only and returns immediately: Shopify submission
// happens later in the worker, so the page shows which stage the order is at.
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { mask } from "@/lib/logger";
import { formatMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { ClearCart } from "./clear-cart";
import { StatusPoller } from "./status-poller";

const STATUS = {
  PENDING_SYNC: {
    callout: "callout-info",
    badge: "badge-info",
    icon: "fas fa-spinner fa-spin",
    label: "Submitting",
    text: "Order received. We are submitting it to the store — this usually takes a few seconds.",
  },
  SYNCED: {
    callout: "callout-success",
    badge: "badge-success",
    icon: "fas fa-check-circle",
    label: "Confirmed",
    text: "Your order is confirmed by the store. We will call you before delivery.",
  },
  FAILED: {
    callout: "callout-danger",
    badge: "badge-danger",
    icon: "fas fa-times-circle",
    label: "Needs attention",
    text: "We could not submit your order to the store. Our team will contact you.",
  },
} as const;

export default async function OrderPage({ params }: PageProps<"/orders/[publicId]">) {
  await connection();
  const { publicId } = await params;
  const order = await prisma.order.findUnique({ where: { publicId }, include: { items: true } });
  if (!order) notFound();
  const s = STATUS[order.status];
  const money = (v: { toFixed(n: number): string }) => formatMoney(v.toFixed(2), order.currency);

  return (
    <div className="container">
      <ClearCart />
      {/* Unmounts once the status is final, which stops the polling. */}
      {order.status === "PENDING_SYNC" && <StatusPoller />}

      <div className="text-center my-4">
        <h1 className="h3">Thank you, {order.customerName.split(" ")[0]}!</h1>
        <p className="text-muted mb-0">Order reference {order.publicId.slice(0, 8).toUpperCase()}</p>
      </div>

      <div className={`callout ${s.callout}`}>
        <h5>
          <i className={`${s.icon} mr-2`} />
          <span className={`badge ${s.badge} mr-2`}>{order.status}</span>
          {s.label}
          {order.shopifyOrderName && <span className="ml-2 text-muted">· store order {order.shopifyOrderName}</span>}
        </h5>
        <p className="mb-0">{s.text}</p>
      </div>

      <div className="row">
        <div className="col-md-8">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Items</h3>
            </div>
            <div className="card-body p-0">
              <table className="table mb-0">
                <tbody>
                  {order.items.map((i) => (
                    <tr key={i.id}>
                      <td>
                        {i.productTitle}
                        <div className="text-muted small">{i.variantTitle}</div>
                      </td>
                      <td className="text-right">
                        {i.quantity} × {money(i.unitPrice)}
                      </td>
                      <td className="text-right">{money(i.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card-footer text-right">
              <strong>Total: {money(order.total)}</strong>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Delivery</h3>
            </div>
            <div className="card-body">
              <p className="mb-1">
                <i className="fas fa-map-marker-alt mr-2 text-muted" />
                {order.city}, {order.country}
              </p>
              <p className="mb-1">
                <i className="fas fa-phone mr-2 text-muted" />
                {mask(order.phone)}
              </p>
              <p className="mb-0">
                <i className="fas fa-money-bill-wave mr-2 text-muted" />
                Cash on Delivery
              </p>
            </div>
          </div>
          <Link href="/products" className="btn btn-primary btn-block">
            Continue shopping
          </Link>
        </div>
      </div>
    </div>
  );
}
