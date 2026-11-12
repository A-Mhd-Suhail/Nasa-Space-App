import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/dal";
import { startDemo } from "@/lib/demo";
import { ApiError, clientIp, describeCause } from "@/lib/http";

/**
 * "Continue with demo": creates an isolated, pre-seeded demo account and signs it in.
 * Submitted as a same-origin form POST from /login (CSRF-checked by the proxy like every POST), so
 * failures redirect back to the login page with a readable message instead of returning JSON.
 */
export async function POST(req: Request) {
  const back = (reason: string) => NextResponse.redirect(new URL(`/login?demo=${reason}`, req.url), 303);
  const ip = clientIp(req);
  try {
    await rateLimit(`demo:${ip ?? "anon"}`, 20, 600);
  } catch (e) {
    if (e instanceof ApiError && e.status === 429) return back("busy");
    return back("failed");
  }
  try {
    const signIn = await startDemo(ip, req.headers.get("x-request-id") ?? undefined);
    if (!signIn.ok) return back("failed");
    const res = NextResponse.redirect(new URL("/app?demo=1", req.url), 303);
    for (const c of signIn.headers.getSetCookie()) res.headers.append("set-cookie", c);
    return res;
  } catch (e) {
    console.error("demo start failed", (e as Error).message.slice(0, 120), "| cause:", describeCause(e));
    return back("failed");
  }
}
