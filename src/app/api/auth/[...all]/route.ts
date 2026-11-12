import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

const handler = () => toNextJsHandler(auth());
export const GET = (req: Request) => handler().GET(req);

export async function POST(req: Request) {
  const res = await handler().POST(req);
  // A sign-up that lost a concurrent race is rewritten to ACCOUNT_EXISTS by an after-hook, but the library keeps the
  // endpoint's original status (422). Give it the same 409 a sequential duplicate gets, so clients see one answer.
  if (res.status === 422 && new URL(req.url).pathname.endsWith("/sign-up/email")) {
    const body = await res.clone().json().catch(() => null);
    if (body?.code === "ACCOUNT_EXISTS") return new Response(JSON.stringify(body), { status: 409, headers: res.headers });
  }
  return res;
}
