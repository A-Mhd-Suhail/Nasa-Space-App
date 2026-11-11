import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MoonNavMark } from "@/components/shell/Mark";
import { Card, Notice } from "@/components/ui";
import { env, isLocalOrigin } from "@/lib/env";

export const metadata: Metadata = { title: "Development mailbox", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Development-only viewer for the outbox mail driver (verification and reset links). Not available in production. */
export default async function DevMail() {
  if (env().MAIL_DRIVER !== "outbox" || !isLocalOrigin(env().APP_URL)) notFound();
  const dir = path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "outbox");
  const files = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, 50);
  const mails = await Promise.all(files.map(async (f) => ({ f, ...(JSON.parse(await readFile(path.join(dir, f), "utf8")) as { to: string; subject: string; text: string; sentAt: string }) })));
  return (
    <main id="main" className="mx-auto max-w-3xl space-y-5 px-4 py-10">
      <MoonNavMark />
      <h1 className="font-display text-3xl">Development mailbox</h1>
      <Notice tone="warn" title="Local development only">MAIL_DRIVER=outbox writes messages to data/outbox/ instead of sending them. This page disappears in production.</Notice>
      {mails.length === 0 && <p className="text-muted">No messages yet.</p>}
      {mails.map((m) => (
        <Card key={m.f} className="p-5">
          <div className="flex flex-wrap justify-between gap-2 text-sm"><span className="font-medium">{m.subject}</span><span className="num text-muted">{m.sentAt?.replace("T", " ").slice(0, 19)} UTC</span></div>
          <div className="text-[13px] text-muted">to {m.to}</div>
          <p className="mt-3 whitespace-pre-wrap break-all text-sm text-text-2">
            {m.text.split(/(https?:\/\/\S+)/).map((part, i) => (/^https?:\/\//.test(part) ? <a key={i} href={part} className="text-accent underline">{part}</a> : part))}
          </p>
        </Card>
      ))}
    </main>
  );
}
