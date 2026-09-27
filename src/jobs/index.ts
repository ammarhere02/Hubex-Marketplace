// Registry: job name -> handler. The worker dispatches through this map.
import { JOBS } from "@/lib/queue";
import type { JobDefinition } from "./run-job";
import { pingJob } from "./ping";
import { submitOrderJob } from "./submit-order";
import { sweepOrdersJob } from "./sweep-orders";
import { syncProductJob } from "./sync-product";
import { syncProductsJob } from "./sync-products";

export const jobDefinitions: Record<string, JobDefinition> = {
  [JOBS.ping]: pingJob,
  [JOBS.syncProducts]: syncProductsJob,
  [JOBS.submitOrder]: submitOrderJob,
  [JOBS.syncProduct]: syncProductJob,
  [JOBS.sweepOrders]: sweepOrdersJob,
};
