"use client";
import { SubmitButton } from "@/components/auth/SubmitButton";
import Link from "next/link";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button, Field, Input, LinkButton, Notice } from "../ui";
import { PasswordInput } from "./PasswordInput";

export function passwordProblems(pw: string, email: string): string[] {
  const p: string[] = [];
  if (pw.length < 12) p.push("at least 12 characters");
  if (pw.length > 128) p.push("at most 128 characters");
  if (!/[A-Za-z]/.test(pw) || !/[0-9\W_]/.test(pw)) p.push("letters plus at least one number or symbol");
  if (email && pw.toLowerCase().includes(email.split("@")[0].toLowerCase()) && email.split("@")[0].length > 3) p.push("not containing your email name");
  return p;
}

/**
 * Shown when the address already has an account. It says so plainly and offers the three next steps; it does not
 * reveal whether the address was ever verified (the resend button is safe for both: it sends nothing for a verified account).
 */
function ExistingAccount({ email, onChange }: { email: string; onChange: () => void }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const [cool, setCool] = useState(0);
  useEffect(() => {
    if (cool <= 0) return;
    const t = setTimeout(() => setCool(cool - 1), 1000);
    return () => clearTimeout(t);
  }, [cool]);
  const q = `?email=${encodeURIComponent(email)}`;
  async function resend() {
    setState("sending");
    setMsg(null);
    const r = await authClient.sendVerificationEmail({ email, callbackURL: "/login?verified=1" });
    if (r.error) {
      setState("error");
      setMsg(r.error.status === 429 ? "Too many requests. Please wait a minute before asking again." : "The link could not be sent. Please try again in a moment.");
    } else {
      setState("sent");
      setCool(30);
    }
  }
  return (
    <div className="space-y-4" data-testid="existing-account">
      <Notice tone="warn" title="You already have an account">
        You have already created an account with this email address. Please sign in.
        <span className="mt-1 block text-xs text-text-2">{email}</span>
      </Notice>
      <div className="flex flex-wrap gap-2">
        <LinkButton variant="primary" href={`/login${q}`} data-testid="existing-signin">Sign in</LinkButton>
        <LinkButton href={`/forgot-password${q}`} data-testid="existing-forgot">Forgot password?</LinkButton>
        <Button type="button" onClick={onChange} data-testid="existing-change">Use a different email</Button>
      </div>
      <p className="text-xs leading-relaxed text-muted">
        Haven&apos;t received your verification email?{" "}
        <button type="button" className="text-accent underline disabled:opacity-50" disabled={state === "sending" || cool > 0} onClick={resend} data-testid="existing-resend">
          {cool > 0 ? `Send again in ${cool}s` : "Send a new link"}
        </button>
      </p>
      <div aria-live="polite" className="text-xs">
        {state === "sent" && <span className="text-ok" data-testid="existing-resend-ok">If that account still needs verifying, a new link is on its way. Earlier links keep working until they expire.</span>}
        {state === "error" && msg && <span className="text-bad" role="alert">{msg}</span>}
      </div>
    </div>
  );
}

export function RegisterForm({ localMail = false }: { localMail?: boolean }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [general, setGeneral] = useState<string | null>(null);
  const [existing, setExisting] = useState<string | null>(null);

  if (existing) return <ExistingAccount email={existing} onChange={() => setExisting(null)} />;
  if (done) {
    return (
      <Notice tone="ok" title="Check your inbox">
        If {done} can receive mail, a verification link is on its way. Open it to activate your account (the link expires in 24 hours).
        {localMail && (
          <span className="mt-2 block" data-testid="local-mail-hint">
            This local copy of MoonNav does not send real email (no mail server is configured). Your verification email is in the{" "}
            <a href="/dev/mail" className="font-medium text-accent underline">local mailbox</a> — open it and click the link. To send real emails, set <code className="font-mono text-xs">MAIL_DRIVER=smtp</code> and the <code className="font-mono text-xs">SMTP_*</code> settings in <code className="font-mono text-xs">.env.local</code>.
          </span>
        )}
      </Notice>
    );
  }
  return (
    <form
      method="post"
      noValidate
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const name = String(f.get("name") ?? "").trim();
        const email = String(f.get("email") ?? "").trim();
        const password = String(f.get("password") ?? "");
        const confirm = String(f.get("confirm") ?? "");
        const errs: Record<string, string> = {};
        if (!name) errs.name = "Enter your name";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "Enter a valid email address";
        const pp = passwordProblems(password, email);
        if (pp.length) errs.password = `Password needs ${pp.join(", ")}`;
        if (password !== confirm) errs.confirm = "Passwords do not match";
        if (f.get("terms") !== "on") errs.terms = "Please accept the terms and privacy notice";
        setErrors(errs);
        if (Object.keys(errs).length) return;
        setBusy(true);
        setGeneral(null);
        const { error } = await authClient.signUp.email({ name, email, password, callbackURL: "/app/onboarding" });
        setBusy(false);
        if (error && (error.status === 409 || error.code === "ACCOUNT_EXISTS")) {
          setExisting(email.toLowerCase());
          return;
        }
        if (error && error.status !== 422 && error.status !== 400) {
          setGeneral(error.status === 429 ? "Too many attempts. Wait a minute and try again." : !error.status || error.status >= 500 ? "MoonNav could not reach its server or database. If you are running locally, start everything with `npm run dev`, then try again." : (error.message ?? "Registration failed. Please try again."));
          return;
        }
        if (error && error.status === 400) {
          setErrors({ password: error.message ?? "Invalid input" });
          return;
        }
        setDone(email);
      }}
    >
      <Field label="Name" htmlFor="name" required error={errors.name}>
        <Input id="name" name="name" autoComplete="name" aria-invalid={!!errors.name} required />
      </Field>
      <Field label="Email" htmlFor="email" required error={errors.email}>
        <Input id="email" name="email" type="email" autoComplete="email" aria-invalid={!!errors.email} required />
      </Field>
      <Field label="Password" htmlFor="password" required error={errors.password} hint="12+ characters with letters and a number or symbol.">
        <PasswordInput id="password" name="password" autoComplete="new-password" aria-invalid={!!errors.password} required />
      </Field>
      <Field label="Confirm password" htmlFor="confirm" required error={errors.confirm}>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" aria-invalid={!!errors.confirm} required />
      </Field>
      <div>
        <label className="flex items-start gap-2 text-sm text-text-2">
          <input type="checkbox" name="terms" className="mt-1" aria-invalid={!!errors.terms} />
          <span>I accept the <Link href="/terms" className="text-accent hover:underline" target="_blank">terms of use</Link> and the <Link href="/privacy" className="text-accent hover:underline" target="_blank">privacy notice</Link>, and understand MoonNav is a research/education prototype.</span>
        </label>
        {errors.terms && <p className="mt-1 text-xs text-bad" role="alert">{errors.terms}</p>}
      </div>
      {general && <Notice tone="bad">{general}</Notice>}
      <SubmitButton disabled={busy}>{busy ? "Creating account…" : "Create account"}</SubmitButton>
    </form>
  );
}
