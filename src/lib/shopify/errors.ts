// One error vocabulary for every Shopify call, so jobs decide retry behaviour
// consistently. `retryable` answers: "could trying again later succeed?"
// `outcomeUnknown` answers: "might Shopify have applied this mutation anyway?"

export class ShopifyError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly outcomeUnknown = false,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Network failure, timeout, or 5xx: the request may or may not have been applied. */
export class ShopifyTransportError extends ShopifyError {
  constructor(message: string, readonly status?: number) {
    super(message, true, true);
  }
}

/** Still throttled after waiting; Shopify did not execute the request. */
export class ShopifyThrottledError extends ShopifyError {
  constructor(message = "Shopify API throttled") {
    super(message, true, false);
  }
}

/** Top-level GraphQL `errors` (bad query, access denied...). Not fixed by retrying. */
export class ShopifyGraphQLError extends ShopifyError {
  constructor(message: string, readonly codes: string[] = []) {
    super(message, false, false);
  }
}

/** Mutation `userErrors`: Shopify rejected the input and applied nothing. */
export class ShopifyUserError extends ShopifyError {
  constructor(
    readonly userErrors: Array<{ field?: string[] | null; message: string; code?: string | null }>,
  ) {
    super(`Shopify rejected input: ${userErrors.map((e) => e.message).join("; ")}`, false, false);
  }
}
