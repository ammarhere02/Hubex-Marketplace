// Passport local strategy: verifies email + password against the User table.
// Next's App Router has no Express middleware chain, so instead of mounting
// passport.authenticate() as middleware we invoke it directly with a minimal
// request shim and resolve a promise from its callback.
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcryptjs";
import { prisma } from "../prisma";

export type AuthUser = { id: number; email: string; name: string };

// Constant-time-ish dummy compare target so unknown emails cost the same as
// wrong passwords (no user-enumeration timing signal).
const DUMMY_HASH = bcrypt.hashSync("invalid-password-placeholder", 10);

passport.use(
  new LocalStrategy({ usernameField: "email", passwordField: "password" }, async (email, password, done) => {
    try {
      const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
      const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
      if (!user || !ok) return done(null, false, { message: "Invalid email or password." });
      return done(null, { id: user.id, email: user.email, name: user.name } satisfies AuthUser);
    } catch (err) {
      return done(err);
    }
  }),
);

/** Runs the passport "local" strategy against the given credentials. */
export function authenticateLocal(email: string, password: string): Promise<AuthUser | null> {
  return new Promise((resolve, reject) => {
    const handler = passport.authenticate("local", { session: false }, (err: unknown, user: AuthUser | false) => {
      if (err) return reject(err instanceof Error ? err : new Error(String(err)));
      resolve(user || null);
    }) as (req: unknown, res: unknown, next: (err?: unknown) => void) => void;
    // LocalStrategy only reads req.body, so a plain object stands in for the request.
    handler({ body: { email, password } }, {}, (err) => (err ? reject(err as Error) : resolve(null)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}
