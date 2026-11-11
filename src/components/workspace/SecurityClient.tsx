"use client";
import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PasswordInput } from "../auth/PasswordInput";
import { passwordProblems } from "../auth/RegisterForm";
import { authClient } from "@/lib/auth-client";
import { Button, Card, CardHeader, Field, Input, Notice } from "../ui";

type Sess = { id: string; token: string; createdAt: Date; expiresAt: Date; ipAddress?: string | null; userAgent?: string | null };

export function SecurityClient({ mfaEnabled, mfaRequired, role }: { mfaEnabled: boolean; mfaRequired: boolean; role: string }) {
  const router = useRouter();
  const [pwMsg, setPwMsg] = useState<{ tone: "ok" | "bad"; t: string } | null>(null);
  const [setup, setSetup] = useState<{ uri: string; qr: string; secret: string; backup: string[] } | null>(null);
  const [mfaMsg, setMfaMsg] = useState<{ tone: "ok" | "bad"; t: string } | null>(null);
  const [sessions, setSessions] = useState<Sess[]>([]);
  const [codes, setCodes] = useState<string[] | null>(null);
  const current = authClient.useSession();
  useEffect(() => {
    authClient.listSessions().then((r) => setSessions((r.data as Sess[]) ?? []));
  }, []);
  return (
    <div className="space-y-4">
      {mfaRequired && !mfaEnabled && <Notice tone="warn" title="Two-factor authentication required">The {role} role requires MFA before administration and data-curation areas open.</Notice>}
      <Card>
        <CardHeader title="Change password" subtitle="Other sessions are signed out." />
        <form className="grid gap-4 p-4 sm:grid-cols-2" onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const np = String(f.get("new"));
          const pp = passwordProblems(np, "");
          if (pp.length) return setPwMsg({ tone: "bad", t: `Password needs ${pp.join(", ")}` });
          const { error } = await authClient.changePassword({ currentPassword: String(f.get("current")), newPassword: np, revokeOtherSessions: true });
          setPwMsg(error ? { tone: "bad", t: error.message ?? "Could not change password" } : { tone: "ok", t: "Password changed." });
        }}>
          <Field label="Current password" htmlFor="cur"><PasswordInput id="cur" name="current" autoComplete="current-password" required /></Field>
          <Field label="New password" htmlFor="newpw" hint="12+ characters"><PasswordInput id="newpw" name="new" autoComplete="new-password" required /></Field>
          <div className="sm:col-span-2 flex items-center gap-3"><Button type="submit" variant="primary">Update password</Button>{pwMsg && <Notice tone={pwMsg.tone}>{pwMsg.t}</Notice>}</div>
        </form>
      </Card>
      <Card>
        <CardHeader title={`Two-factor authentication: ${mfaEnabled ? "on" : "off"}`} subtitle="Time-based one-time codes (TOTP) from an authenticator app." />
        <div className="space-y-3 p-4">
          {!mfaEnabled && !setup && (
            <form className="flex flex-wrap items-end gap-3" onSubmit={async (e) => {
              e.preventDefault();
              const pw = String(new FormData(e.currentTarget).get("pw"));
              const { data, error } = await authClient.twoFactor.enable({ password: pw });
              if (error || !data || !("totpURI" in data)) return setMfaMsg({ tone: "bad", t: error?.message ?? "Could not start setup" });
              const secret = new URL(data.totpURI).searchParams.get("secret") ?? "";
              setSetup({ uri: data.totpURI, qr: await QRCode.toDataURL(data.totpURI, { margin: 1, width: 192 }), secret, backup: data.backupCodes });
            }}>
              <Field label="Confirm your password to start" htmlFor="pw2fa"><PasswordInput id="pw2fa" name="pw" autoComplete="current-password" required /></Field>
              <Button type="submit" variant="primary">Set up 2FA</Button>
            </form>
          )}
          {setup && (
            <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={setup.qr} alt="QR code for your authenticator app" width={192} height={192} className="rounded bg-white p-1" />
              <div className="space-y-3 text-sm">
                <p>Scan the code, or enter this key manually: <code className="num break-all rounded bg-panel-3 px-1.5">{setup.secret}</code></p>
                <details><summary className="cursor-pointer text-accent">Backup codes (store them safely — shown once)</summary><ul className="num mt-2 grid grid-cols-2 gap-1 text-xs">{setup.backup.map((c) => <li key={c}>{c}</li>)}</ul></details>
                <form className="flex flex-wrap items-end gap-3" onSubmit={async (e) => {
                  e.preventDefault();
                  const code = String(new FormData(e.currentTarget).get("code")).trim();
                  const { error } = await authClient.twoFactor.verifyTotp({ code });
                  if (error) return setMfaMsg({ tone: "bad", t: "That code is not valid. Check your device clock." });
                  setMfaMsg({ tone: "ok", t: "Two-factor authentication is on." });
                  setSetup(null);
                  router.refresh();
                }}>
                  <Field label="Enter a code to confirm" htmlFor="code"><Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required /></Field>
                  <Button type="submit" variant="primary">Confirm</Button>
                </form>
              </div>
            </div>
          )}
          {mfaEnabled && (
            <div className="space-y-3 rounded-[5px] border border-line bg-panel-2 p-4">
              <div className="text-sm font-medium">Recovery codes</div>
              <p className="text-xs text-muted">Each backup code signs you in once if you lose your authenticator. Generating new codes invalidates the old ones.</p>
              {codes ? (
                <ul className="num grid grid-cols-2 gap-1 font-mono text-xs sm:grid-cols-5">{codes.map((c) => <li key={c} className="rounded-[3px] border border-line bg-panel px-2 py-1">{c}</li>)}</ul>
              ) : (
                <form className="flex flex-wrap items-end gap-3" onSubmit={async (e) => {
                  e.preventDefault();
                  const { data, error } = await authClient.twoFactor.generateBackupCodes({ password: String(new FormData(e.currentTarget).get("pw")) });
                  if (error || !data) return setMfaMsg({ tone: "bad", t: error?.message ?? "Could not generate codes" });
                  setCodes(data.backupCodes);
                }}>
                  <Field label="Password" htmlFor="pwcodes"><PasswordInput id="pwcodes" name="pw" autoComplete="current-password" required /></Field>
                  <Button type="submit">Generate new recovery codes</Button>
                </form>
              )}
            </div>
          )}
          {mfaEnabled && (
            <form className="flex flex-wrap items-end gap-3" onSubmit={async (e) => {
              e.preventDefault();
              const { error } = await authClient.twoFactor.disable({ password: String(new FormData(e.currentTarget).get("pw")) });
              setMfaMsg(error ? { tone: "bad", t: error.message ?? "Could not disable" } : { tone: "ok", t: "Two-factor authentication is off." });
              router.refresh();
            }}>
              <Field label="Password to disable 2FA" htmlFor="pwoff"><PasswordInput id="pwoff" name="pw" autoComplete="current-password" required /></Field>
              <Button type="submit" variant="danger" disabled={mfaRequired}>Disable 2FA</Button>
              {mfaRequired && <span className="text-xs text-muted">Required for your role.</span>}
            </form>
          )}
          {mfaMsg && <Notice tone={mfaMsg.tone}>{mfaMsg.t}</Notice>}
        </div>
      </Card>
      <Card>
        <CardHeader title="Active sessions" actions={<Button s="sm" onClick={async () => { await authClient.revokeOtherSessions(); const r = await authClient.listSessions(); setSessions((r.data as Sess[]) ?? []); }}>Sign out other sessions</Button>} />
        <ul className="divide-y divide-line text-sm">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
              <span className="min-w-0 truncate text-text-2">{s.userAgent?.slice(0, 80) ?? "Unknown device"} <span className="num text-xs text-muted">· {String(s.ipAddress ?? "")} · since {new Date(s.createdAt).toISOString().slice(0, 16).replace("T", " ")}</span></span>
              {current.data?.session.id === s.id ? <span className="text-xs text-accent">this device</span> : <Button s="sm" onClick={async () => { await authClient.revokeSession({ token: s.token }); setSessions(sessions.filter((x) => x.id !== s.id)); }}>Revoke</Button>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
