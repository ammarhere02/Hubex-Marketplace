// Wraps every job handler with the same lifecycle:
//   1. JobLog row STARTED + "job started" log line
//   2. run the handler (which may log progress through ctx.log)
//   3. COMPLETED with durationMs, or FAILED with error + whether BullMQ will retry
// The JobLog row lives in MySQL, so attempt history survives Redis/worker restarts.
import { UnrecoverableError, type Job } from "bullmq";
import { prisma } from "@/lib/prisma";
import type { Logger } from "@/lib/logger";

export interface JobContext {
  job: Job;
  attempt: number;
  log: Logger;
}

export type JobHandler = (ctx: JobContext) => Promise<unknown>;

export interface JobDefinition {
  handler: JobHandler;
  /** Related entity for logs/JobLog (e.g. order ID). */
  entityId?: (job: Job) => string | undefined;
}

export async function runJob(def: JobDefinition, job: Job, baseLog: Logger): Promise<unknown> {
  // attemptsStarted is incremented by BullMQ when the job becomes active: 1-based.
  const attempt = job.attemptsStarted;
  const maxAttempts = job.opts.attempts ?? 1;
  const entityId = def.entityId?.(job);
  const log = baseLog.child({ jobName: job.name, jobId: job.id, attempt, maxAttempts, entityId });

  const startedAt = new Date();
  const row = await prisma.jobLog.create({
    data: {
      queueName: job.queueName,
      jobName: job.name,
      jobId: String(job.id),
      attempt,
      status: "STARTED",
      entityId,
      startedAt,
    },
  });
  log.info("job started");

  try {
    const result = await def.handler({ job, attempt, log });
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    await prisma.jobLog.update({
      where: { id: row.id },
      data: { status: "COMPLETED", finishedAt, durationMs },
    });
    log.info({ durationMs }, "job completed");
    return result;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    const willRetry = !(err instanceof UnrecoverableError) && attempt < maxAttempts;
    // Never let a JobLog write failure hide the original error.
    await prisma.jobLog
      .update({
        where: { id: row.id },
        data: {
          status: "FAILED",
          finishedAt,
          durationMs,
          error: `${err.message}\n${err.stack ?? ""}`.slice(0, 60_000),
          willRetry,
        },
      })
      .catch((e) => log.error({ err: e }, "could not persist JobLog failure"));
    log.error({ err, durationMs, willRetry }, "job failed");
    throw err;
  }
}
