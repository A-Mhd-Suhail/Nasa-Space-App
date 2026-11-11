"use client";
import { useEffect } from "react";
import { MoonNavGlyph } from "@/components/shell/Mark";
import { Button, LinkButton } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error.digest ?? "client error");
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
