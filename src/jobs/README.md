# src/jobs/
Job handlers executed by the worker. `run-job.ts` wraps every handler with the same lifecycle:
`JobLog` row (STARTED → COMPLETED/FAILED), start/complete/fail log lines with job name, ID,
attempt, entity ID, duration, error stack and whether BullMQ will retry.

- `index.ts` — job name → handler registry.
- `ping.ts` — diagnostic job (`npm run job:ping`, `npm run job:ping -- --fail`).
