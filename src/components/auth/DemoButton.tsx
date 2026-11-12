"use client";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui";

/**
 * One-click demo: a same-origin form POST to /api/v1/demo, which creates an isolated, pre-seeded 24-hour account
 * (see lib/demo.ts) and signs it in. `link` is the quiet login-page form, `cta` the prominent home-page button.
 */
export function DemoButton({ variant = "link", testId = "demo-button" }: { variant?: "link" | "cta"; testId?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <form method="post" action="/api/v1/demo" onSubmit={() => setBusy(true)} className={variant === "link" ? "mt-3 text-center" : "inline-block"}>
      {variant === "link" ? (
        <button type="submit" disabled={busy} className="text-sm text-text-2 underline decoration-line-2 underline-offset-4 hover:text-text disabled:opacity-60" data-testid={testId}>
          {busy ? "Preparing demo workspace…" : "Continue with demo"}
        </button>
      ) : (
        <Button type="submit" disabled={busy} s="lg" data-testid={testId}>
          {busy ? "Preparing your demo…" : <>Try the demo, no account <ArrowRight size={17} /></>}
        </Button>
      )}
      {variant === "link" && <p className="mt-1 text-xs text-muted">Private sample workspace with real analyses · expires after 24 h</p>}
    </form>
  );
}
