import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsIndex() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings" />
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ["/settings/profile", "Profile & preferences", "Name, preferred mode, display time zone, data export and account deletion."],
          ["/settings/security", "Security", "Password, two-factor authentication (MFA) and active sessions."],
        ].map(([h, t, d]) => (
          <Link key={h} href={h}><Card className="h-full p-5 hover:border-accent/50"><div className="font-medium">{t}</div><p className="mt-1 text-sm text-text-2">{d}</p></Card></Link>
        ))}
      </div>
    </div>
  );
}
