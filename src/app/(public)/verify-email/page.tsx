"use client";
import { SubmitButton } from "@/components/auth/SubmitButton";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthCard } from "@/components/auth/AuthCard";
import { Field, Input, Notice } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

function VerifyInner() {
  const sp = useSearchParams();
  const err = sp.get("error");
  const [sent, setSent] = useState(false);
  return (
    <div className="space-y-4">
      {err ? <Notice tone="warn" title="This verification link is invalid or has expired">Request a new link below.</Notice> : <Notice>Open the link we emailed you to verify your address. You can request a new link here.</Notice>}
      {sent ? (
        <Notice tone="ok">If that address belongs to an unverified account, a new link is on its way.</Notice>
      ) : (
        <form method="post" className="space-y-3" onSubmit={async (e) => { e.preventDefault(); const email = String(new FormData(e.currentTarget).get("email") ?? ""); await authClient.sendVerificationEmail({ email, callbackURL: "/app/onboarding" }); setSent(true); }}>
          <Field label="Email" htmlFor="email" required><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
          <SubmitButton>Send verification link</SubmitButton>
        </form>
      )}
      <p className="text-sm text-text-2"><Link href="/login" className="text-accent hover:underline">Back to sign in</Link></p>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthCard title="Verify your email">
      <Suspense><VerifyInner /></Suspense>
    </AuthCard>
  );
}
