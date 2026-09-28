import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateLocal } from "@/lib/auth/passport";
import { createSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const user = await authenticateLocal(parsed.data.email, parsed.data.password);
  if (!user) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  await createSession(user.id);
  logger.info({ userId: user.id }, "auth: user logged in");
  return NextResponse.json({ user });
}
