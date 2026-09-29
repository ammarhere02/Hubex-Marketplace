"use server";

// Admin "retry" for a FAILED order. Resets the MySQL attempt budget first,
// then swaps the finished Redis job for a fresh one; if the process dies
// between the two steps, the order is back in PENDING_SYNC and the existing
// sweep-orders recovery job re-enqueues it.
import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/auth/admin";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { requeueSubmitOrder } from "@/lib/queue";

export async function retryOrder(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!isAdmin(user)) throw new Error("Forbidden");

  const orderId = Number(formData.get("orderId"));
  if (!Number.isInteger(orderId) || orderId <= 0) throw new Error("Invalid order id");

  // Guarded update: only a FAILED order is retryable, so double-submits and
  // stale pages are no-ops instead of resetting an in-flight order.
  const { count } = await prisma.order.updateMany({
    where: { id: orderId, status: "FAILED" },
    data: { status: "PENDING_SYNC", attempts: 0, lastError: null },
  });
  if (count === 1) await requeueSubmitOrder(orderId);

  revalidatePath("/admin/orders");
}
