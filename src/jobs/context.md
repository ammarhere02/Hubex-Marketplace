# src/jobs/ — context for Claude
- attempt = job.attemptsStarted (1-based while running). willRetry = attempt < opts.attempts && not UnrecoverableError.
- Handlers receive { job, attempt, log }; throw to fail; throw UnrecoverableError to stop retries.
- sync-products.ts: per-product transaction upsert stamped lastSyncedAt=runStartedAt; variants flagged isRemoved (OrderItems reference them), images deleted; product-level reconcile only after the generator finishes. Trigger: `npm run sync:products [-- --wait]`.
- submit-order.ts: skip if SYNCED; Order.attempts++ in DB (cap 5); lookup by custom ID (publicId) → adopt; else orderCreate; userErrors → lookup again, then UnrecoverableError → FAILED. Retryable errors store lastError; last attempt → FAILED.
- Verified 2026-09-26: order 1 → #1007 SYNCED; lost-reply sim (order 2, pre-created #1008) adopted, no duplicate; bad variant (order 3) → FAILED after 1 attempt.
