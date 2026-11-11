"use client";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthCard } from "@/components/auth/AuthCard";
import { Field, Input, Notice } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { safeNext } from "@/lib/safe-next";

function TwoFactorForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [err, setErr] = useState<string | null>(null);
  const [backup, setBackup] = useState(false);
  return (
    <form
      method="post"
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const code = String(f.get("code") ?? "").trim();
        const res = backup ? await authClient.twoFactor.verifyBackupCode({ code }) : await authClient.twoFactor.verifyTotp({ code, trustDevice: f.get("trust") === "on" });
        if (res.error) return setErr(res.error.status === 429 ? "Too many attempts. Wait and try again." : "That code is not valid.");
        router.push(next);
        router.refresh();
      }}
    >
      <Field label={backup ? "Backup code" : "6-digit authenticator code"} htmlFor="code" required>
        <Input id="code" name="code" inputMode={backup ? "text" : "numeric"} autoComplete="one-time-code" required autoFocus />
      </Field>
      {!backup && <label className="flex items-center gap-2 text-sm text-text-2"><input type="checkbox" name="trust" /> Trust this device for 30 days</label>}
      {err && <Notice tone="bad">{err}</Notice>}
      <SubmitButton>Verify</SubmitButton>
      <button type="button" className="text-sm text-accent hover:underline" onClick={() => setBackup(!backup)}>{backup ? "Use authenticator code" : "Use a backup code instead"}</button>
    </form>
  );
}

export default function TwoFactorPage() {
  return (
    <AuthCard title="Two-factor verification" subtitle="Enter the code from your authenticator app.">
      <Suspense><TwoFactorForm /></Suspense>
    </AuthCard>
  );
}
