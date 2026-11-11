"use client";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense, useState } from "react";
import { AuthCard } from "@/components/auth/AuthCard";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { passwordProblems } from "@/components/auth/RegisterForm";
import { Field, Notice } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

function ResetInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const token = sp.get("token");
  const [err, setErr] = useState<string | null>(null);
  if (!token || sp.get("error")) return <Notice tone="warn" title="This reset link is invalid or has expired"><Link className="text-accent underline" href="/forgot-password">Request a new link</Link>.</Notice>;
  return (
    <form method="post" className="space-y-4" onSubmit={async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const pw = String(f.get("password") ?? "");
      const pp = passwordProblems(pw, "");
      if (pp.length) return setErr(`Password needs ${pp.join(", ")}`);
      if (pw !== String(f.get("confirm") ?? "")) return setErr("Passwords do not match");
      const { error } = await authClient.resetPassword({ newPassword: pw, token });
      if (error) return setErr("This reset link is invalid or has expired.");
      router.push("/login?reset=1");
    }}>
      <Field label="New password" htmlFor="password" required hint="12+ characters with letters and a number or symbol."><PasswordInput id="password" name="password" autoComplete="new-password" required /></Field>
      <Field label="Confirm new password" htmlFor="confirm" required><PasswordInput id="confirm" name="confirm" autoComplete="new-password" required /></Field>
      {err && <Notice tone="bad">{err}</Notice>}
      <SubmitButton>Update password</SubmitButton>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthCard title="Choose a new password">
      <Suspense><ResetInner /></Suspense>
    </AuthCard>
  );
}
