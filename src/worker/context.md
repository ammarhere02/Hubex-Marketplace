# src/worker/ — context for Claude
- Concurrency: catalog 1, orders 2. Don't name functions `process` (shadows Node global).
- Repeatable schedules + sweeper get registered here in Phase 8/9.
