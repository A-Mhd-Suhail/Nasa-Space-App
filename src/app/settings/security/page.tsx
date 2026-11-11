import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { SecurityClient } from "@/components/workspace/SecurityClient";
import { requirePageUser } from "@/lib/dal";

export const metadata: Metadata = { title: "Security" };

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ mfa?: string }> }) {
  const u = await requirePageUser("/settings/security");
  const { mfa } = await searchParams;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Security" description="Password, two-factor authentication and sessions." />
      <SecurityClient mfaEnabled={u.twoFactorEnabled} mfaRequired={mfa === "required" || ["curator", "admin"].includes(u.role)} role={u.role} />
    </div>
  );
}
