import Link from "next/link";

/** MoonNav mark: a lunar disk with its terminator, crossed by the copper traverse. */
export function MoonNavGlyph({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <circle cx="16" cy="16" r="11.5" fill="var(--panel)" stroke="var(--text)" strokeWidth="1.4" />
      <path d="M16 4.5a11.5 11.5 0 0 1 0 23a7.5 11.5 0 0 0 0-23z" fill="var(--text)" />
      <path d="M3 22.5 C10 19 15 21 20 15 S27 9 30 8" fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeDasharray="2.6 2.2" strokeLinecap="round" />
      <circle cx="20" cy="15" r="2" fill="var(--accent)" stroke="var(--panel)" strokeWidth="1" />
    </svg>
  );
}

export function MoonNavMark({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 rounded-md text-text" aria-label="MoonNav home">
      <MoonNavGlyph />
      {!compact && <span className="font-display text-[20px] font-medium leading-none tracking-[-0.02em]">MoonNav</span>}
    </Link>
  );
}
