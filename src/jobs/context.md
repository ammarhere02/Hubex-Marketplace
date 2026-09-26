# src/jobs/ — context for Claude
- attempt = job.attemptsStarted (1-based while running). willRetry = attempt < opts.attempts && not UnrecoverableError.
- Handlers receive { job, attempt, log }; throw to fail; throw UnrecoverableError to stop retries.
- sync-products.ts: per-product transaction upsert stamped lastSyncedAt=runStartedAt; variants flagged isRemoved (OrderItems reference them), images deleted; product-level reconcile only after the generator finishes. Trigger: `npm run sync:products [-- --wait]`.
- Next: submit-order (Phase 5, uses lib/shopify/orders.ts: look up before create).
