import type { Metadata } from "next";
import { InvitationAcceptClient } from "@/components/workspace/InvitationAcceptClient";
import { currentUser } from "@/lib/dal";
import { PublicShell } from "@/components/shell/PublicShell";

export const metadata: Metadata = { title: "Workspace invitation", robots: { index: false, follow: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  await params; // token is read client-side
  const u = await currentUser();
  return (
    <PublicShell>
      <InvitationAcceptClient signedIn={!!u} signedInEmail={u?.email ?? null} verified={!!u?.emailVerified} />
    </PublicShell>
  );
}
