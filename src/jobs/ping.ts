// Diagnostic job: proves web/CLI -> Redis -> worker -> MySQL (JobLog) works.
// `data.fail: true` makes it throw so the failure path can be observed too.
import type { JobDefinition } from "./run-job";

export const pingJob: JobDefinition = {
  async handler({ job, log }) {
    log.info({ message: job.data?.message }, "ping received");
    await new Promise((r) => setTimeout(r, 200));
    if (job.data?.fail) throw new Error("ping asked to fail");
    return { pong: true, at: new Date().toISOString() };
  },
};
