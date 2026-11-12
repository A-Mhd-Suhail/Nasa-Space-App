"use client";
import { DemoButton } from "@/components/auth/DemoButton";
import { SubmitButton } from "@/components/auth/SubmitButton";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { safeNext } from "@/lib/safe-next";
import { Field, Input, Notice } from "../ui";
import { PasswordInput } from "./PasswordInput";

export function LoginForm({ localMail = false }: { localMail?: boolean }) {
  const sp = useSearchParams();
  const router = useRouter();
  const next = safeNext(sp.get("next"));
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "").trim();
    setBusy(true);
    setError(null);
    setUnverified(null);
    const { data, error } = await authClient.signIn.email({ email, password: String(f.get("password") ?? ""), rememberMe: f.get("remember") === "on" });
    setBusy(false);
    if (error) {
      if (error.status === 403) setUnverified(email);
      else if (error.status === 429) setError("Too many attempts. Wait a minute and try again.");
      else if (!error.status || error.status >= 500) setError("MoonNav could not reach its server or database. If you are running locally, start everything with `npm run dev`, then try again.");
      else setError("Email or password is incorrect.");
      return;
    }
    // MFA accounts: the auth client is already navigating to /login/two-factor. Navigating to `next`
    // as well raced with it (WebKit let this push win and bounced the user back to /login).
    if (data && typeof data === "object" && "twoFactorRedirect" in data && data.twoFactorRedirect) return;
    router.push(next);
    router.refresh();
  }

  return (
    <>
    <form method="post" onSubmit={onSubmit} className="space-y-4" noValidate>
      {sp.get("verified") === "1" && <Notice tone="ok" title="Email verified">You can sign in now.</Notice>}
      {sp.get("reset") === "1" && <Notice tone="ok" title="Password updated">Sign in with your new password. Other sessions were signed out.</Notice>}
      {next !== "/app" && <Notice>Sign in to continue to the page you requested.</Notice>}
      {sp.get("demo") === "busy" && <Notice tone="warn" title="Demo temporarily unavailable">Too many demo workspaces were started from this network in the last few minutes. Please try again shortly, or create a free account.</Notice>}
      {sp.get("demo") === "failed" && <Notice tone="bad" title="Demo could not be started">The sample workspace could not be prepared. Try again in a moment, or <Link href="/explore" className="text-accent underline">explore the polar map without an account</Link>. If it keeps failing, the service status is on the <Link href="/sources" className="text-accent underline">data sources</Link> page.</Notice>}
      <Field label="Email" htmlFor="email" required>
        <Input id="email" name="email" type="email" autoComplete="email" defaultValue={sp.get("email") ?? ""} required />
      </Field>
      <Field label="Password" htmlFor="password" required>
        <PasswordInput id="password" name="password" autoComplete="current-password" required />
      </Field>
      <div className="flex items-center justify-between text-sm">
        <label className="flex items-center gap-2 text-text-2"><input type="checkbox" name="remember" defaultChecked /> Remember this device (7 days)</label>
        <Link href="/forgot-password" className="text-accent hover:underline">Forgot password?</Link>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      {unverified && (
        <Notice tone="warn" title="Verify your email first">
          We sent a verification link when you registered.{" "}
          {resent ? "A new link is on its way." : (
            <button type="button" className="text-accent underline" onClick={async () => { setResendError(null); const r = await authClient.sendVerificationEmail({ email: unverified, callbackURL: "/login?verified=1" }); if (r.error) setResendError(r.error.status === 429 ? "Too many requests. Wait a minute and try again." : "The link could not be sent. Try again in a moment."); else setResent(true); }}>Send a new link</button>
          )}
          {resendError && <span className="mt-1 block text-bad" role="alert">{resendError}</span>}
          {localMail && <span className="mt-1 block">Running locally without a mail server: open the <a href="/dev/mail" className="text-accent underline">local mailbox</a> to find the link.</span>}
        </Notice>
      )}
      <SubmitButton disabled={busy}>{busy ? "Signing in…" : "Sign in"}</SubmitButton>
    </form>
    <DemoButton />
    </>
  );
}
