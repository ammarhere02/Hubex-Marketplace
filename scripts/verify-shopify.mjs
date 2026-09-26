// Read-only check that the app itself can authenticate with the Admin API.
// Run: npm run verify:shopify   (never prints the secret or the token)
const { SHOPIFY_SHOP, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, SHOPIFY_API_VERSION } = process.env;

for (const [name, value] of Object.entries({ SHOPIFY_SHOP, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, SHOPIFY_API_VERSION })) {
  if (!value) {
    console.error(`Missing ${name} in .env`);
    process.exit(1);
  }
}

const base = `https://${SHOPIFY_SHOP}.myshopify.com`;

// Step 1: exchange client ID + secret for a short-lived access token.
const tokenRes = await fetch(`${base}/admin/oauth/access_token`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "client_credentials",
    client_id: SHOPIFY_CLIENT_ID,
    client_secret: SHOPIFY_CLIENT_SECRET,
  }),
});
if (!tokenRes.ok) {
  console.error(`Token request failed: HTTP ${tokenRes.status}`, (await tokenRes.text()).slice(0, 300));
  process.exit(1);
}
const { access_token, scope, expires_in } = await tokenRes.json();
console.log(`1. Token received ✓ (scopes: ${scope}; expires in ${expires_in}s)`);

// Step 2: a small read-only GraphQL query using that token.
const gqlRes = await fetch(`${base}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": access_token },
  body: JSON.stringify({
    query: "{ shop { name myshopifyDomain } productsCount { count } }",
  }),
});
const body = await gqlRes.json();
if (!gqlRes.ok || body.errors) {
  console.error(`GraphQL request failed: HTTP ${gqlRes.status}`, JSON.stringify(body.errors ?? ""));
  process.exit(1);
}
const { shop, productsCount } = body.data;
console.log(`2. Admin API read ✓ shop="${shop.name}" (${shop.myshopifyDomain}), products=${productsCount.count}`);
