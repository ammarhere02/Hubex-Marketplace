import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// The client caches its token at module scope: import a fresh copy per test.
// The errors module must come from the same fresh registry or instanceof fails.
type Client = typeof import("@/lib/shopify/client");
type Errors = typeof import("@/lib/shopify/errors");
let client: Client;
let ShopifyGraphQLError: Errors["ShopifyGraphQLError"];
let ShopifyThrottledError: Errors["ShopifyThrottledError"];
let ShopifyTransportError: Errors["ShopifyTransportError"];
let ShopifyUserError: Errors["ShopifyUserError"];

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const TOKEN_URL = /admin\/oauth\/access_token/;
const GQL_URL = /admin\/api\/2026-07\/graphql\.json/;

function tokenResponse(token = "tok-1", expiresIn = 3600) {
  return new Response(JSON.stringify({ access_token: token, expires_in: expiresIn }), { status: 200 });
}
function gqlResponse(body: unknown, status = 200, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers });
}
const okCost = {
  requestedQueryCost: 10,
  actualQueryCost: 10,
  throttleStatus: { maximumAvailable: 1000, currentlyAvailable: 900, restoreRate: 50 },
};

beforeEach(async () => {
  vi.resetModules();
  fetchMock.mockReset();
  client = await import("@/lib/shopify/client");
  ({ ShopifyGraphQLError, ShopifyThrottledError, ShopifyTransportError, ShopifyUserError } = await import(
    "@/lib/shopify/errors"
  ));
});
afterEach(() => {
  vi.useRealTimers();
});

/** Default happy-path routing: token endpoint then GraphQL endpoint. */
function route(gql: () => Response | Promise<Response>) {
  fetchMock.mockImplementation(async (url: string) => {
    if (TOKEN_URL.test(String(url))) return tokenResponse();
    if (GQL_URL.test(String(url))) return gql();
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe("shopifyGraphQL", () => {
  it("fetches a token once and reuses it for subsequent calls", async () => {
    route(() => gqlResponse({ data: { ok: 1 }, extensions: { cost: okCost } }));
    await client.shopifyGraphQL("query A { x }");
    await client.shopifyGraphQL("query B { y }");
    const tokenCalls = fetchMock.mock.calls.filter(([u]) => TOKEN_URL.test(String(u)));
    expect(tokenCalls).toHaveLength(1);
    const gqlCalls = fetchMock.mock.calls.filter(([u]) => GQL_URL.test(String(u)));
    expect(gqlCalls).toHaveLength(2);
    expect((gqlCalls[0][1] as RequestInit).headers).toMatchObject({ "X-Shopify-Access-Token": "tok-1" });
  });

  it("shares one in-flight token request between concurrent callers", async () => {
    route(() => gqlResponse({ data: { ok: 1 } }));
    await Promise.all([client.shopifyGraphQL("query { a }"), client.shopifyGraphQL("query { b }")]);
    expect(fetchMock.mock.calls.filter(([u]) => TOKEN_URL.test(String(u)))).toHaveLength(1);
  });

  it("refreshes the token once on 401 and repeats the request", async () => {
    let gqlCall = 0;
    let tokenCall = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (TOKEN_URL.test(String(url))) return tokenResponse(`tok-${++tokenCall}`);
      gqlCall++;
      return gqlCall === 1 ? gqlResponse({}, 401) : gqlResponse({ data: { ok: true } });
    });
    const data = await client.shopifyGraphQL<{ ok: boolean }>("query { x }");
    expect(data.ok).toBe(true);
    expect(tokenCall).toBe(2);
  });

  it("fails permanently when the second 401 arrives after a refresh", async () => {
    route(() => gqlResponse({}, 401));
    await expect(client.shopifyGraphQL("query { x }")).rejects.toThrow(ShopifyGraphQLError);
  });

  it("throws a retryable transport error on network failure", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (TOKEN_URL.test(String(url))) return tokenResponse();
      throw new TypeError("fetch failed");
    });
    await expect(client.shopifyGraphQL("query { x }")).rejects.toThrow(ShopifyTransportError);
  });

  it("throws a transport error (outcome unknown) on HTTP 5xx", async () => {
    route(() => gqlResponse({}, 503));
    const err = (await client.shopifyGraphQL("mutation { m }").catch((e: Error) => e)) as InstanceType<Errors["ShopifyTransportError"]>;
    expect(err).toBeInstanceOf(ShopifyTransportError);
    expect(err.outcomeUnknown).toBe(true);
    expect(err.status).toBe(503);
  });

  it("throws a transport error when the body is cut off mid-stream", async () => {
    route(() => new Response("{\"data\": {", { status: 200 }));
    await expect(client.shopifyGraphQL("mutation { m }")).rejects.toThrow(/Unreadable Shopify response/);
  });

  it("waits and retries on HTTP 429, honouring Retry-After", async () => {
    vi.useFakeTimers();
    let calls = 0;
    route(() => (++calls === 1 ? gqlResponse({}, 429, { "Retry-After": "1" }) : gqlResponse({ data: { ok: 1 } })));
    const pending = client.shopifyGraphQL<{ ok: number }>("query { x }");
    await vi.advanceTimersByTimeAsync(1_100);
    expect((await pending).ok).toBe(1);
    expect(calls).toBe(2);
  });

  it("waits and retries when GraphQL reports THROTTLED, then gives up after 5 retries", async () => {
    vi.useFakeTimers();
    const throttled = {
      errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }],
      extensions: {
        cost: { requestedQueryCost: 100, throttleStatus: { maximumAvailable: 1000, currentlyAvailable: 0, restoreRate: 50 } },
      },
    };
    route(() => gqlResponse(throttled));
    const pending = client.shopifyGraphQL("query { x }").catch((e) => e);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await pending).toBeInstanceOf(ShopifyThrottledError);
    // 1 initial + 5 throttle retries
    expect(fetchMock.mock.calls.filter(([u]) => GQL_URL.test(String(u)))).toHaveLength(6);
  });

  it("throws a permanent GraphQL error with codes for non-throttle errors", async () => {
    route(() =>
      gqlResponse({ errors: [{ message: "Field 'x' doesn't exist", extensions: { code: "GRAPHQL_VALIDATION" } }] }),
    );
    const err = (await client.shopifyGraphQL("query { x }").catch((e: Error) => e)) as InstanceType<Errors["ShopifyGraphQLError"]>;
    expect(err).toBeInstanceOf(ShopifyGraphQLError);
    expect(err.retryable).toBe(false);
    expect(err.codes).toContain("GRAPHQL_VALIDATION");
  });

  it("rejects when the token endpoint returns 4xx (bad credentials are permanent)", async () => {
    fetchMock.mockImplementation(async () => gqlResponse({}, 403));
    await expect(client.shopifyGraphQL("query { x }")).rejects.toThrow(ShopifyGraphQLError);
  });

  it("treats token endpoint 5xx as retryable transport", async () => {
    fetchMock.mockImplementation(async () => gqlResponse({}, 502));
    await expect(client.shopifyGraphQL("query { x }")).rejects.toThrow(ShopifyTransportError);
  });
});

describe("assertNoUserErrors", () => {
  it("does nothing without userErrors", () => {
    expect(() => client.assertNoUserErrors({ userErrors: [] })).not.toThrow();
    expect(() => client.assertNoUserErrors({})).not.toThrow();
  });

  it("throws ShopifyUserError listing the messages", () => {
    expect(() => client.assertNoUserErrors({ userErrors: [{ message: "bad phone" }] })).toThrow(ShopifyUserError);
  });
});
