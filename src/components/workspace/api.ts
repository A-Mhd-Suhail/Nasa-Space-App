"use client";

export type ApiErr = { code: string; message: string; requestId?: string; fieldErrors?: { field: string; message: string }[] };

export async function api<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const r = await fetch(url, { method: init?.method ?? "GET", headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined, body: init?.body !== undefined ? JSON.stringify(init.body) : undefined });
  if (r.status === 204) return undefined as T;
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d?.error?.message ?? `Request failed (${r.status})`), { api: (d?.error ?? { code: "http_error", message: `HTTP ${r.status}` }) as ApiErr, status: r.status });
  return d as T;
}

export function fieldErrorMap(e: unknown): Record<string, string> {
  const fe = (e as { api?: ApiErr })?.api?.fieldErrors ?? [];
  return Object.fromEntries(fe.map((f) => [f.field, f.message]));
}
