"use client";
import { ChevronDown, LogOut, Settings, Shield, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";

export function ProfileMenu({ name, email, role }: { name: string; email: string; role: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => {
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} className="flex h-9 items-center gap-1.5 rounded-[5px] border border-line-2 bg-panel py-1 pl-1 pr-1.5 text-sm hover:bg-panel-2">
        <span className="grid h-7 w-7 place-items-center rounded-[4px] bg-accent text-xs font-semibold text-accent-ink">{initials}</span>
        <ChevronDown size={14} className="text-muted" />
        <span className="sr-only">Account menu for {name}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-64 overflow-hidden rounded-[6px] border border-line bg-panel shadow-[var(--shadow-float)]">
          <div className="border-b border-line px-3 py-2.5">
            <div className="truncate text-sm font-medium">{name}</div>
            <div className="truncate text-xs text-muted">{email}</div>
            <div className="mt-1.5 inline-flex rounded-[3px] border border-accent/45 px-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-accent">{role}</div>
          </div>
          <Link role="menuitem" href="/settings/profile" className="flex items-center gap-2 px-3 py-2 text-sm text-text-2 hover:bg-panel-2 hover:text-text"><User size={15} />Profile & preferences</Link>
          <Link role="menuitem" href="/settings/security" className="flex items-center gap-2 px-3 py-2 text-sm text-text-2 hover:bg-panel-2 hover:text-text"><Shield size={15} />Security & MFA</Link>
          <Link role="menuitem" href="/app/settings" className="flex items-center gap-2 px-3 py-2 text-sm text-text-2 hover:bg-panel-2 hover:text-text"><Settings size={15} />All settings</Link>
          <button role="menuitem" type="button" onClick={async () => { await authClient.signOut(); router.push("/"); router.refresh(); }} className="flex w-full items-center gap-2 border-t border-line px-3 py-2 text-left text-sm text-text-2 hover:bg-panel-2 hover:text-text">
            <LogOut size={15} />Sign out
          </button>
        </div>
      )}
    </div>
  );
}
