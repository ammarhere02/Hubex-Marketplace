# src/worker/
The separate background process: `npm run worker`. It consumes the `catalog` and `orders`
queues and dispatches jobs to `src/jobs`. It also logs queue-level `completed`, `failed`
and `stalled` events. Ctrl-C shuts down gracefully (active jobs finish first).
The web app never runs jobs; it only enqueues them.
