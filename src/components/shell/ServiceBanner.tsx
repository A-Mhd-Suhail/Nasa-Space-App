import { databaseReachable } from "@/lib/system-status";

/** Shown on public pages when the database is down: sign-in, accounts and the demo need it. */
export async function ServiceBanner() {
  if (await databaseReachable()) return null;
  return (
    <div role="alert" className="border-b border-bad/40 bg-bad-soft px-4 py-2 text-center text-[13px] text-text" data-testid="service-banner">
      <strong>The MoonNav database is not running</strong> — sign-in, account creation and the demo are unavailable. Start the full local stack with <code className="font-mono">npm run dev</code> (database, science service, worker and web app).
    </div>
  );
}
