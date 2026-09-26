// Server-only Admin GraphQL client shared by the worker and CLI scripts.
// - Access token: client-credentials grant, cached in memory until shortly before expiry.
// - Cost limits: reads `extensions.cost.throttleStatus`; waits and retries only when
//   Shopify says THROTTLED (a throttled request is never executed, so this is safe
//   even for mutations). Also slows down pre-emptively when the bucket runs low.
// - Transport failures are NOT retried here: for a mutation the outcome is unknown,
//   and only the caller knows how to check (see jobs/submit-order).
// Never logs tokens, variables, or response bodies (they can contain customer data).
import { env } from "@/lib/env";
import { logger, type Logger } from "@/lib/logger";
import {
  ShopifyGraphQLError,
  ShopifyThrottledError,
  ShopifyTransportError,
  ShopifyUserError,
} from "./errors";

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_THROTTLE_RETRIES = 5;
const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000;

interface ThrottleStatus {
  maximumAvailable: number;
  currentlyAvailable: number;
  restoreRate: number;
}
interface Cost {
  requestedQueryCost: number;
  actualQueryCost?: number | null;
  throttleStatus: ThrottleStatus;
}
interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
  extensions?: { cost?: Cost };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const baseUrl = () => `https://${env().SHOPIFY_SHOP}.myshopify.com`;

// ---------- access token ----------

let token: { value: string; expiresAt: number } | undefined;
let tokenRequest: Promise<string> | undefined;

async function fetchToken(): Promise<string> {
  const { SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET } = env();
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: SHOPIFY_CLIENT_ID,
        client_secret: SHOPIFY_CLIENT_SECRET,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    throw new ShopifyTransportError(`Token request failed: ${(e as Error).message}`);
  }
  if (res.status >= 500) throw new ShopifyTransportError(`Token request HTTP ${res.status}`, res.status);
  if (!res.ok) throw new ShopifyGraphQLError(`Token request rejected: HTTP ${res.status}`);
  const body = (await res.json()) as { access_token: string; expires_in?: number };
  const ttlMs = (body.expires_in ?? 3600) * 1000;
  token = { value: body.access_token, expiresAt: Date.now() + ttlMs - TOKEN_REFRESH_MARGIN_MS };
  logger.info({ component: "shopify", expiresInS: body.expires_in }, "shopify access token obtained");
  return token.value;
}

async function getToken(): Promise<string> {
  if (token && Date.now() < token.expiresAt) return token.value;
  // Share one in-flight request between concurrent callers.
  tokenRequest ??= fetchToken().finally(() => (tokenRequest = undefined));
  return tokenRequest;
}

// ---------- GraphQL ----------

export interface GraphQLOptions {
  log?: Logger;
  /** Short label for logs, e.g. "orderCreate". Never the query text. */
  operation?: string;
}

export async function shopifyGraphQL<T>(
  query: string,
  variables: Record<string, unknown> = {},
  opts: GraphQLOptions = {},
): Promise<T> {
  const log = (opts.log ?? logger).child({ component: "shopify", operation: opts.operation });
  const url = `${baseUrl()}/admin/api/${env().SHOPIFY_API_VERSION}/graphql.json`;
  let refreshedToken = false;

  for (let throttleRetry = 0; ; throttleRetry++) {
    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": await getToken(),
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (e) {
      throw new ShopifyTransportError(`Shopify request failed: ${(e as Error).message}`);
    }

    if (res.status === 401 && !refreshedToken) {
      // Token expired or revoked early: fetch a new one once. A 401 is rejected
      // before execution, so repeating the request is safe.
      token = undefined;
      refreshedToken = true;
      throttleRetry--;
      continue;
    }
    if (res.status === 429) {
      if (throttleRetry >= MAX_THROTTLE_RETRIES) throw new ShopifyThrottledError();
      const wait = Number(res.headers.get("Retry-After") ?? 2) * 1000;
      log.warn({ waitMs: wait, throttleRetry }, "shopify HTTP 429, backing off");
      await sleep(wait);
      continue;
    }
    if (res.status >= 500) throw new ShopifyTransportError(`Shopify HTTP ${res.status}`, res.status);
    if (!res.ok) throw new ShopifyGraphQLError(`Shopify HTTP ${res.status}`);

    let body: GraphQLResponse<T>;
    try {
      body = (await res.json()) as GraphQLResponse<T>;
    } catch (e) {
      // Body cut off mid-stream: we cannot tell whether a mutation ran.
      throw new ShopifyTransportError(`Unreadable Shopify response: ${(e as Error).message}`);
    }
    const cost = body.extensions?.cost;
    const codes = (body.errors ?? []).map((e) => e.extensions?.code ?? "UNKNOWN");

    if (codes.includes("THROTTLED")) {
      if (throttleRetry >= MAX_THROTTLE_RETRIES) throw new ShopifyThrottledError();
      const wait = cost ? waitForCost(cost.requestedQueryCost, cost.throttleStatus) : 2000;
      log.warn({ waitMs: wait, throttleRetry, cost: summarize(cost) }, "shopify throttled, backing off");
      await sleep(wait);
      continue;
    }
    if (body.errors?.length) {
      throw new ShopifyGraphQLError(body.errors.map((e) => e.message).join("; "), codes);
    }

    log.debug({ durationMs: Date.now() - started, cost: summarize(cost) }, "shopify call ok");
    // Pre-emptive pacing: keep a reserve in the leaky bucket for the next call.
    if (cost && cost.throttleStatus.currentlyAvailable < cost.throttleStatus.maximumAvailable * 0.1) {
      await sleep(waitForCost(cost.requestedQueryCost, cost.throttleStatus));
    }
    return body.data as T;
  }
}

/** Throws ShopifyUserError when a mutation payload has userErrors. */
export function assertNoUserErrors(payload: {
  userErrors?: Array<{ field?: string[] | null; message: string; code?: string | null }>;
}): void {
  if (payload.userErrors?.length) throw new ShopifyUserError(payload.userErrors);
}

function waitForCost(needed: number, t: ThrottleStatus): number {
  const deficit = Math.max(0, needed - t.currentlyAvailable);
  return Math.ceil((deficit / Math.max(t.restoreRate, 1)) * 1000) + 250;
}

function summarize(cost?: Cost) {
  if (!cost) return undefined;
  return {
    requested: cost.requestedQueryCost,
    actual: cost.actualQueryCost,
    available: cost.throttleStatus.currentlyAvailable,
  };
}
