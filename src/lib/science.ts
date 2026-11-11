import "server-only";
import { env } from "./env";
import { ApiError } from "./http";

/** Server-side client for the internal Python science API. */
export async function science<T>(path: string, init?: { method?: string; body?: unknown; timeoutMs?: number; requestId?: string }): Promise<T> {
  const e = env();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init?.timeoutMs ?? 20_000);
  let r: Response;
  try {
    r = await fetch(`${e.SCIENCE_API_URL}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${e.SCIENCE_SERVICE_TOKEN}`,
        "Content-Type": "application/json",
        ...(init?.requestId ? { "x-request-id": init.requestId } : {}),
      },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      signal: ctrl.signal,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(503, "science_unavailable", "The science service is unavailable. Precomputed demonstrations remain available.");
  } finally {
    clearTimeout(t);
  }
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    const err = (data as { error?: { code?: string; message?: string; fieldErrors?: { field: string; message: string }[] }; detail?: string } | null) ?? null;
    if (r.status === 422) throw new ApiError(422, err?.error?.code ?? "invalid_input", err?.error?.message ?? "Invalid input", err?.error?.fieldErrors);
    // Upstream data sources (e.g. JPL Horizons) report their own outage codes; pass them through.
    if (r.status === 503 && err?.error?.code) throw new ApiError(503, err.error.code, err.error.message ?? "Upstream data source unavailable");
    throw new ApiError(502, "science_error", "The science service returned an error");
  }
  return data as T;
}

export async function scienceHealth(): Promise<{ status: string; [k: string]: unknown }> {
  try {
    const r = await fetch(`${env().SCIENCE_API_URL}/health`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    return (await r.json()) as { status: string };
  } catch {
    return { status: "unavailable" };
  }
}
