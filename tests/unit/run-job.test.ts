import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnrecoverableError, type Job } from "bullmq";

const { jobLog } = vi.hoisted(() => ({ jobLog: { create: vi.fn(), update: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: { jobLog } }));

import { runJob, type JobDefinition } from "@/jobs/run-job";
import { logger } from "@/lib/logger";

const job = (over: Partial<Job> = {}) =>
  ({
    id: "job-1",
    name: "submit-order",
    queueName: "orders",
    attemptsStarted: 1,
    opts: { attempts: 5 },
    data: { orderId: 7 },
    ...over,
  }) as unknown as Job;

beforeEach(() => {
  vi.clearAllMocks();
  jobLog.create.mockResolvedValue({ id: 55 });
  jobLog.update.mockResolvedValue({});
});

describe("runJob", () => {
  it("writes a STARTED row, runs the handler, then marks COMPLETED with duration", async () => {
    const def: JobDefinition = { handler: async () => ({ ok: 1 }), entityId: (j) => String(j.data.orderId) };
    const result = await runJob(def, job(), logger);
    expect(result).toEqual({ ok: 1 });
    expect(jobLog.create.mock.calls[0][0].data).toMatchObject({
      queueName: "orders",
      jobName: "submit-order",
      jobId: "job-1",
      attempt: 1,
      status: "STARTED",
      entityId: "7",
    });
    const done = jobLog.update.mock.calls[0][0];
    expect(done.where).toEqual({ id: 55 });
    expect(done.data.status).toBe("COMPLETED");
    expect(done.data.durationMs).toBeTypeOf("number");
  });

  it("marks FAILED with error+stack and willRetry=true when attempts remain", async () => {
    const def: JobDefinition = {
      handler: async () => {
        throw new Error("boom");
      },
    };
    await expect(runJob(def, job({ attemptsStarted: 2 } as never), logger)).rejects.toThrow("boom");
    const failed = jobLog.update.mock.calls[0][0].data;
    expect(failed.status).toBe("FAILED");
    expect(failed.willRetry).toBe(true);
    expect(failed.error).toContain("boom");
    expect(failed.error).toContain("at "); // stack present
  });

  it("sets willRetry=false on the final attempt", async () => {
    const def: JobDefinition = {
      handler: async () => {
        throw new Error("boom");
      },
    };
    await expect(runJob(def, job({ attemptsStarted: 5 } as never), logger)).rejects.toThrow();
    expect(jobLog.update.mock.calls[0][0].data.willRetry).toBe(false);
  });

  it("sets willRetry=false for UnrecoverableError regardless of attempts left", async () => {
    const def: JobDefinition = {
      handler: async () => {
        throw new UnrecoverableError("permanent");
      },
    };
    await expect(runJob(def, job(), logger)).rejects.toThrow("permanent");
    expect(jobLog.update.mock.calls[0][0].data.willRetry).toBe(false);
  });

  it("re-throws the handler error even when persisting the JobLog failure fails", async () => {
    jobLog.update.mockRejectedValue(new Error("db down"));
    const def: JobDefinition = {
      handler: async () => {
        throw new Error("original");
      },
    };
    await expect(runJob(def, job(), logger)).rejects.toThrow("original");
  });
});
