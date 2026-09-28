// Structured JSON logs (Pino). One root logger; components use child loggers so
// every line carries `component` (web, worker, job name...).
import pino from "pino";

// Defence in depth: even if a secret or customer field is passed by mistake,
// these paths are replaced before the line is written.
export const REDACT_PATHS = [
  "token",
  "accessToken",
  "access_token",
  "clientSecret",
  "client_secret",
  "password",
  "authorization",
  "headers.authorization",
  'headers["x-shopify-access-token"]',
  "*.token",
  "*.accessToken",
  "*.password",
  "*.phone",
  "*.email",
  "*.address1",
  "*.address2",
  "phone",
  "email",
  "address1",
  "address2",
];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "hubex-marketplace", pid: process.pid },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: { paths: REDACT_PATHS, censor: "[redacted]" },
  serializers: { err: pino.stdSerializers.err },
});

export type Logger = typeof logger;

/** Keeps the first/last characters only: "+923001234567" -> "+9*********67". */
export function mask(value: string | null | undefined, keep = 2): string {
  if (!value) return "";
  if (value.length <= keep * 2) return "*".repeat(value.length);
  return value.slice(0, keep) + "*".repeat(value.length - keep * 2) + value.slice(-keep);
}
