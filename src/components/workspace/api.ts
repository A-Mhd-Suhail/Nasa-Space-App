"use client";

export type ApiErr = { code: string; message: string; requestId?: string; fieldErrors?: { field: string; message: string }[] };

export async function api<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const r = await fetch(url, { method: init?.method ?? "GET", headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined, body: init?.body !== undefined ? JSON.stringify(init.body) : undefined });
  if (r.status === 204) return undefined as T;
  const d = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(d?.error?.message ?? `Request failed (${r.status})`), { api: (d?.error ?? { code: "http_error", message: `HTTP ${r.status}` }) as ApiErr, status: r.status });
  // A 2xx whose body cannot be read (for example a read cancelled by navigation) is a failure, never an empty success:
  // callers would otherwise render against `{}` and crash on the first missing field.
  if (d === null) throw Object.assign(new Error("The server sent an unreadable response. Please try again."), { api: { code: "bad_response", message: "Unreadable response" } as ApiErr, status: r.status });
  return d as T;
}

export function fieldErrorMap(e: unknown): Record<string, string> {
  const fe = (e as { api?: ApiErr })?.api?.fieldErrors ?? [];
  return Object.fromEntries(fe.map((f) => [f.field, f.message]));
}
