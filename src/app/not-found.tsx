import Link from "next/link";
import { MoonNavGlyph } from "@/components/shell/Mark";
import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-[80vh] max-w-xl flex-col items-start justify-center px-6 py-16">
      <MoonNavGlyph size={40} />
      <p className="num mt-8 font-mono text-[13px] text-muted">404 · off the traverse</p>
      <h1 className="mt-2 font-display text-[clamp(2rem,1.4rem+2vw,3rem)] leading-tight">This page is outside our coverage.</h1>
      <p className="mt-3 text-text-2">The link may be mistyped, or the object may have been deleted or belong to a workspace you are not in.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <LinkButton href="/" variant="primary">Back to MoonNav</LinkButton>
        <LinkButton href="/explore">Open the explorer</LinkButton>
      </div>
      <p className="mt-10 text-sm text-muted">Looking for your work? <Link href="/app">Open the workspace</Link>.</p>
    </main>
  );
}
