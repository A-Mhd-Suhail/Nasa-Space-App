"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, CardHeader, Notice } from "@/components/ui";
import { api } from "@/components/workspace/api";

type Preview = { invitation: { workspaceName: string; workspaceId: string; role: string; email: string; expiresAt: string }; inviterName: string };

export function InvitationAcceptClient({ signedIn, signedInEmail, verified }: { signedIn: boolean; signedInEmail: string | null; verified: boolean }) {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const router = useRouter();
  const qc = useQueryClient();
  const [acceptErr, setAcceptErr] = useState<string | null>(null);

  const preview = useQuery<Preview>({
    queryKey: ["invitation", token],
    queryFn: () => api(`/api/v1/invitations/${token}`),
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () => api<{ ok: boolean; workspaceId: string; workspaceName: string; role: string }>(`/api/v1/invitations/accept`, { method: "POST", body: { token } }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      router.push(`/app/workspaces?joined=${encodeURIComponent(d.workspaceName)}`);
    },
    onError: (e) => setAcceptErr((e as Error).message),
  });

  if (preview.isLoading) return <div className="mx-auto max-w-md py-16 text-center text-sm text-muted">Loading invitation…</div>;
  if (preview.isError || !preview.data) {
    return (
      <div className="mx-auto max-w-md py-16">
        <Card>
          <CardHeader title="Invitation not available" subtitle="The link may have expired, been revoked, or already used." />
          <div className="p-5 text-sm text-text-2">
            <p className="mb-4">If you believe this is an error, ask the workspace owner to send a new invitation.</p>
            <Link href="/" className="text-accent hover:underline">Return home</Link>
          </div>
        </Card>
      </div>
    );
  }

  const { invitation, inviterName } = preview.data;
  // Compute mismatch during render (not in an effect) to avoid cascading renders.
  const emailMismatch = signedIn && signedInEmail && signedInEmail.toLowerCase() !== invitation.email.toLowerCase();
  const mismatchMsg = emailMismatch
    ? `This invitation was sent to ${invitation.email}, but you are signed in as ${signedInEmail}. Sign out and back in with the invited address, or ask the workspace owner to re-send.`
    : null;

  return (
    <div className="mx-auto max-w-md py-12">
      <Card>
        <CardHeader title={<span className="font-display text-xl">Join “{invitation.workspaceName}”</span>} subtitle={`${inviterName} invited you to collaborate as ${invitation.role}.`} />
        <div className="space-y-4 p-5 text-sm text-text-2">
          <p>You were invited as <strong className="text-text">{invitation.email}</strong>.</p>
          <p className="text-xs text-muted">Expires {new Date(invitation.expiresAt).toLocaleString()}.</p>
          {(acceptErr || mismatchMsg) && <Notice tone="bad">{acceptErr ?? mismatchMsg}</Notice>}
          {!signedIn && (
            <div className="space-y-3">
              <p>To accept, sign in or create a MoonNav account with the email above.</p>
              <div className="flex gap-2">
                <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`} className="flex-1"><Button variant="primary" className="w-full">Sign in</Button></Link>
                <Link href={`/register?next=${encodeURIComponent(`/invite/${token}`)}&email=${encodeURIComponent(invitation.email)}`} className="flex-1"><Button className="w-full">Create account</Button></Link>
              </div>
            </div>
          )}
          {signedIn && !emailMismatch && !verified && (
            <div className="space-y-3">
              <p>Verify your email address first, then come back to accept.</p>
              <Link href="/app/settings"><Button variant="primary">Go to settings</Button></Link>
            </div>
          )}
          {signedIn && !emailMismatch && verified && (
            <div className="space-y-3">
              <p>Ready to join.</p>
              <Button variant="primary" className="w-full" disabled={accept.isPending} onClick={() => accept.mutate()}>{accept.isPending ? "Joining…" : `Join “${invitation.workspaceName}”`}</Button>
            </div>
          )}
          {signedIn && emailMismatch && (
            <div className="space-y-3">
              <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}><Button variant="primary">Sign in with {invitation.email}</Button></Link>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
