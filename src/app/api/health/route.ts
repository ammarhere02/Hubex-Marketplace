import { NextResponse } from "next/server";

// Railway healthcheck target (see railway.json healthcheckPath). Public in
// proxy.ts: the auth gate would otherwise 307 it to /login and the deploy
// would be marked unhealthy. Reports liveness only — no DB/Redis probes, so a
// dependency blip doesn't take the web service out of rotation.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ status: "ok" });
}
