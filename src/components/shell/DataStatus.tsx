"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { cx } from "../ui";

type Health = { status: string; science?: { status: string }; worker?: { status: string; liveWorkers?: number; lastSeenAt?: string | null }; database?: { status: string } };

/** Live readiness from /api/v1/health. Never a fabricated "all systems live" state. */
export function DataStatus() {
  const { data, isError } = useQuery<Health>({ queryKey: ["health"], queryFn: () => fetch("/api/v1/health").then((r) => r.json()), refetchInterval: 30_000 });
  const sci = data?.science?.status ?? "unknown";
  const worker = data?.worker?.status ?? "unknown";
  const ok = !isError && !!data && sci === "ok" && worker === "ok";
  const label = isError || !data ? "Checking services" : ok ? "Engine + worker online" : sci === "ok" ? "No live worker" : "Engine unavailable";
  const tone = isError || !data ? "bg-unknown" : ok ? "bg-ok" : sci === "ok" ? "bg-warn" : "bg-bad";
  return (
    <Link href="/sources" title={`Database: ${data?.database?.status ?? "?"} · Science engine: ${sci} · Worker: ${worker}`} className="hidden h-9 items-center gap-2 rounded-[5px] px-2.5 text-[13px] text-text-2 hover:bg-panel-3/60 xl:flex">
      <span className={cx("relative h-2 w-2 rounded-full", tone)} aria-hidden>
        {ok && <span className="absolute inset-0 animate-ping rounded-full bg-ok opacity-40 motion-reduce:hidden" />}
      </span>
      {label}
    </Link>
  );
}
