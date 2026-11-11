import { NextResponse, type NextRequest } from "next/server";

/**
 * CSRF defence-in-depth for the app API: state-changing browser requests must come from
 * our own origin. (Session cookies are also HttpOnly + SameSite=Lax; Better Auth applies its
 * own origin checks on /api/auth.) Requests without an Origin header (server-to-server,
 * the worker with its bearer token) are not browser CSRF vectors and pass through.
 */
export function proxy(req: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return NextResponse.next();
  const origin = req.headers.get("origin");
  if (origin) {
    const allowed = new URL(process.env.APP_URL ?? req.nextUrl.origin).origin;
    if (origin !== allowed && origin !== req.nextUrl.origin) {
      return NextResponse.json({ error: { code: "forbidden_origin", message: "Cross-origin request rejected" } }, { status: 403 });
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ["/api/v1/:path*"] };
