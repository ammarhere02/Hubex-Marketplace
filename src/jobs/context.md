# src/jobs/ — context for Claude
- attempt = job.attemptsStarted (1-based while running). willRetry = attempt < opts.attempts && not UnrecoverableError.
- Handlers receive { job, attempt, log }; throw to fail; throw UnrecoverableError to stop retries.
- Next: sync-products (Phase 4), submit-order (Phase 5, uses lib/shopify/orders.ts: look up before create).
