// Bull Board: an operator dashboard for the orders (checkout → submit-order) and
// catalog queues: retries, failures, job data. Behind HTTP Basic Auth and hidden (404)
// unless BULL_BOARD_USER and BULL_BOARD_PASSWORD are set. Not linked from the
// storefront: job data contains order details and the board can retry or delete jobs.
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { HonoAdapter } from "@bull-board/hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { env } from "@/lib/env";
import { getQueue, QUEUES } from "@/lib/queue";

const BASE_PATH = "/admin/queues";

let app: Hono | undefined;

function boardApp(username: string, password: string): Hono {
  if (app) return app;
  const serverAdapter = new HonoAdapter(serveStatic).setBasePath(BASE_PATH);
  createBullBoard({
    queues: [new BullMQAdapter(getQueue(QUEUES.orders)), new BullMQAdapter(getQueue(QUEUES.catalog))],
    serverAdapter,
    options: { uiConfig: { boardTitle: "Hubex queues" } },
  });
  const auth = basicAuth({ username, password });
  app = new Hono()
    .use(BASE_PATH, auth)
    .use(`${BASE_PATH}/*`, auth)
    .route(BASE_PATH, serverAdapter.registerPlugin());
  return app;
}

function handle(request: Request): Response | Promise<Response> {
  const { BULL_BOARD_USER, BULL_BOARD_PASSWORD } = env();
  if (!BULL_BOARD_USER || !BULL_BOARD_PASSWORD) return new Response("Not found", { status: 404 });
  return boardApp(BULL_BOARD_USER, BULL_BOARD_PASSWORD).fetch(request);
}

export const dynamic = "force-dynamic";
export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
