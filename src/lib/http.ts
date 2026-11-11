import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fieldErrors?: { field: string; message: string }[],
  ) {
    super(message);
  }
}

export const notFound = (what = "Resource") => new ApiError(404, "not_found", `${what} not found`);
export const forbidden = (msg = "You do not have access to this resource") => new ApiError(403, "forbidden", msg);
export const unauthorized = () => new ApiError(401, "unauthorized", "Sign in required");

export function errorResponse(err: unknown, requestId: string): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, requestId, ...(err.fieldErrors ? { fieldErrors: err.fieldErrors } : {}) } },
      { status: err.status, headers: { "x-request-id": requestId } },
    );
  }
  if (err instanceof ZodError) {
    const fieldErrors = err.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
    return NextResponse.json(
      { error: { code: "invalid_input", message: "Request validation failed", requestId, fieldErrors } },
      { status: 422, headers: { "x-request-id": requestId } },
    );
  }
  console.error(JSON.stringify({ level: "error", requestId, message: err instanceof Error ? err.message : String(err) }));
  return NextResponse.json(
    { error: { code: "internal_error", message: "Unexpected server error", requestId } },
    { status: 500, headers: { "x-request-id": requestId } },
  );
}

type Handler<C> = (req: Request, ctx: C, requestId: string) => Promise<Response>;

/** Wrap a route handler with request ids and the consistent error contract. */
export function route<C = unknown>(h: Handler<C>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    const requestId = req.headers.get("x-request-id") ?? randomUUID();
    try {
      const res = await h(req, ctx, requestId);
      res.headers.set("x-request-id", requestId);
      return res;
    } catch (err) {
      return errorResponse(err, requestId);
    }
  };
}

export function json(data: unknown, init?: number | ResponseInit): NextResponse {
  return NextResponse.json(data, typeof init === "number" ? { status: init } : init);
}

export async function readJson(req: Request): Promise<unknown> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 5_000_000) throw new ApiError(413, "payload_too_large", "Request body too large");
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON");
  }
}

export function clientIp(req: Request): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip");
}
