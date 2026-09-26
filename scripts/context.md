# scripts/ — context for Claude

- Loaded env via `node --env-file=.env`; plain `.mjs`, no TS build step (yet).
- `verify-shopify.mjs` duplicates token logic on purpose (standalone smoke test). Once `src/lib/shopify` exists, new scripts should import the shared client instead of re-implementing it (will need `tsx` or similar).
- Must never log tokens, secrets, or customer data.
