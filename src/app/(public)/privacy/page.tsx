import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 text-sm leading-relaxed text-text-2 sm:px-6">
      <PageHeader title="Privacy" description="What MoonNav stores and why." />
      <div className="space-y-4">
        <p><strong className="text-text">Account data.</strong> Your name, email address, a salted password hash (scrypt), session records (with IP address and browser user agent, for security), your role and display preferences. Passwords are never stored in plain text.</p>
        <p><strong className="text-text">Workspace data.</strong> Projects, scenarios, analysis results and reports you create. Scenarios and results are immutable so they stay reproducible.</p>
        <p><strong className="text-text">Security records.</strong> Audit events for sign-in-related administration, role changes, data approvals and report sharing. These are append-only.</p>
        <p><strong className="text-text">Cookies.</strong> One HttpOnly, SameSite session cookie. No advertising or analytics cookies are set.</p>
        <p><strong className="text-text">Your controls.</strong> Settings → Profile lets you export your data as JSON and delete your account. Deletion removes your workspaces, sessions and credentials and anonymises your user record; public scientific source provenance is kept.</p>
        <p><strong className="text-text">Public pages.</strong> Coordinate lookups on the public explorer are rate-limited by IP address; the address is not stored with the result.</p>
      </div>
    </div>
  );
}
