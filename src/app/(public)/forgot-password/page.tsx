"use client";
import { SubmitButton } from "@/components/auth/SubmitButton";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AuthCard } from "@/components/auth/AuthCard";
import { Field, Input, Notice } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Arriving from the "account already exists" screen: carry the address over.
    const e = new URLSearchParams(window.location.search).get("email");
    if (e && emailRef.current && !emailRef.current.value) emailRef.current.value = e;
  }, [sent]);
  return (
    <AuthCard title="Reset your password" subtitle="We will email a reset link that is valid for 30 minutes." footer={<Link className="text-accent hover:underline" href="/login">Back to sign in</Link>}>
      {sent ? (
        <Notice tone="ok" title="Check your inbox">If an account exists for that address, a reset link is on its way.</Notice>
      ) : (
        <form method="post" className="space-y-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); const email = String(new FormData(e.currentTarget).get("email") ?? "").trim(); await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" }); setBusy(false); setSent(true); }}>
          <Field label="Email" htmlFor="email" required><Input id="email" name="email" type="email" autoComplete="email" ref={emailRef} required /></Field>
          <SubmitButton disabled={busy}>{busy ? "Sending…" : "Send reset link"}</SubmitButton>
        </form>
      )}
    </AuthCard>
  );
}
