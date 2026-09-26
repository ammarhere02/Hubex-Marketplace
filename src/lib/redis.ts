// Redis connections for BullMQ. Workers block on Redis, so BullMQ requires
// maxRetriesPerRequest: null (it handles reconnects itself).
import { Redis } from "ioredis";
import { env } from "./env";

export function createRedisConnection(): Redis {
  return new Redis(env().REDIS_URL, { maxRetriesPerRequest: null });
}
