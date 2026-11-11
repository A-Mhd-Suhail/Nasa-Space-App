"use client";
import { SubmitButton } from "@/components/auth/SubmitButton";
import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Field, Input, Notice } from "../ui";
import { PasswordInput } from "./PasswordInput";

export function passwordProblems(pw: string, email: string): string[] {
  const p: string[] = [];
  if (pw.length < 12) p.push("at least 12 characters");
  if (pw.length > 128) p.push("at most 128 characters");
  if (!/[A-Za-z]/.test(pw) || !/[0-9\W_]/.test(pw)) p.push("letters plus at least one number or symbol");
  if (email && pw.toLowerCase().includes(email.split("@")[0].toLowerCase()) && email.split("@")[0].length > 3) p.push("not containing your email name");
  return p;
}

export function RegisterForm({ localMail = false }: { localMail?: boolean }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [general, setGeneral] = useState<string | null>(null);

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
        // Non-enumerating: an existing address gets the same confirmation screen.
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
