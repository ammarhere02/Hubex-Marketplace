// Bull Board: an operator dashboard for the orders (checkout → submit-order) and
// catalog queues: retries, failures, job data. Gated by the app's own session
// login: only the env-configured admin (ADMIN_EMAIL/ADMIN_PASSWORD, signed in via
// /login) may view it. Anonymous visitors are redirected to /login; signed-in
// non-admins get 404 so the board's existence isn't advertised. Hidden entirely
// (404) unless ADMIN_EMAIL and ADMIN_PASSWORD are set. Not linked from the
// storefront: job data contains order details and the board can retry or delete jobs.
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { HonoAdapter } from "@bull-board/hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { isAdmin } from "@/lib/auth/admin";
import { getSessionUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { getQueue, QUEUES } from "@/lib/queue";

const BASE_PATH = "/admin/queues";

let app: Hono | undefined;

function boardApp(): Hono {
  if (app) return app;
  const serverAdapter = new HonoAdapter(serveStatic).setBasePath(BASE_PATH);
  createBullBoard({
    queues: [new BullMQAdapter(getQueue(QUEUES.orders)), new BullMQAdapter(getQueue(QUEUES.catalog))],
    serverAdapter,
    options: { uiConfig: { boardTitle: "Hubex queues" } },
  });
  app = new Hono().route(BASE_PATH, serverAdapter.registerPlugin());
  return app;
}

async function handle(request: Request): Promise<Response> {
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = env();
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return new Response("Not found", { status: 404 });

  const user = await getSessionUser();
  if (!user) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", BASE_PATH);
    return Response.redirect(login, 302);
  }
  if (!isAdmin(user)) return new Response("Not found", { status: 404 });

  return boardApp().fetch(request);
}

export const dynamic = "force-dynamic";
export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
