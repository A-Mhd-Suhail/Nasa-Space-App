"use client";
import { useEffect } from "react";
import { MoonNavGlyph } from "@/components/shell/Mark";
import { Button, LinkButton } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Server errors carry only a digest (details stay in server logs). For client render errors log the type and
    // message so a report can be diagnosed; never the stack, props or user data.
    console.error(error.digest ?? `client error: ${error.name}: ${String(error.message).slice(0, 200)}`);
  }, [error]);
  return (
    <main id="main" className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-start justify-center px-6 py-16">
      <MoonNavGlyph size={40} />
      <h1 className="mt-8 font-display text-[clamp(1.8rem,1.3rem+1.6vw,2.6rem)] leading-tight">Something went wrong on this page.</h1>
      <p className="mt-3 text-text-2">Your data is safe. Try again; if it keeps happening, note the reference below.</p>
      {error.digest && <p className="num mt-2 font-mono text-[13px] text-muted">Reference {error.digest}</p>}
      <div className="mt-8 flex flex-wrap gap-3">
        <Button variant="primary" onClick={reset}>Try again</Button>
        <LinkButton href="/">Back to MoonNav</LinkButton>
      </div>
    </main>
  );
}
