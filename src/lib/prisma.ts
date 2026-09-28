// Single Prisma client per process. Prisma 7 talks to MySQL through a driver
// adapter (mariadb connector, MySQL-compatible). In Next dev, hot reload would
// otherwise create a new pool on every edit, so the client is kept on globalThis.
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "./env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function create(): PrismaClient {
  const url = new URL(env().DATABASE_URL);
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    connectionLimit: 5,
    // MySQL 8+ defaults to caching_sha2_password; over a non-TLS link (Railway's
    // private network) the driver must fetch the server's RSA key to log in.
    allowPublicKeyRetrieval: true,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? create();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
