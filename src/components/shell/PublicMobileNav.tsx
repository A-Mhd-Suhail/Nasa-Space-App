"use client";
import { Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cx } from "../ui";
import { ModeToggle } from "./ModeToggle";
import { ThemeToggle } from "./ThemeToggle";

export function PublicNavLinks({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
      {items.map((n) => {
        const active = path === n.href || path.startsWith(`${n.href}/`);
        return (
          <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={cx("relative rounded-md px-3 py-1.5 text-sm transition-colors", active ? "text-text" : "text-text-2 hover:text-text")}>
            {n.label}
            {active && <span aria-hidden className="absolute inset-x-3 -bottom-[17px] h-[2px] bg-accent" />}
          </Link>
        );
      })}
    </nav>
  );
}

export function PublicMobileNav({ items, signedIn }: { items: { href: string; label: string }[]; signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);
  const all = [...items, ...(signedIn ? [{ href: "/app", label: "Open workspace" }] : [{ href: "/login", label: "Sign in" }, { href: "/register", label: "Start planning" }])];
  return (
    <div className="lg:hidden">
      <button type="button" aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(!open)} className="grid h-10 w-10 place-items-center rounded-md border border-line-2 bg-panel text-text">
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.nav
            id="mobile-nav"
            aria-label="Mobile"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
            className="fixed inset-x-0 bottom-0 top-16 z-40 overflow-y-auto border-t border-line bg-bg px-4 pb-8 pt-3"
          >
            <ul className="divide-y divide-line">
              {all.map((n) => (
                <li key={n.href}>
                  <Link href={n.href} onClick={() => setOpen(false)} className="flex items-center justify-between py-4 font-display text-[22px] text-text">
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex items-center justify-between text-sm text-muted">Mode <ModeToggle signedIn={signedIn} /></div>
            <div className="mt-3 flex items-center justify-between text-sm text-muted">Theme <ThemeToggle /></div>
          </motion.nav>
        )}
      </AnimatePresence>
    </div>
  );
}
