import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { ProfileForm } from "@/components/workspace/ProfileForm";
import { requirePageUser } from "@/lib/dal";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const u = await requirePageUser("/settings/profile");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Profile & preferences" description="Display preferences never change scientific timestamps, which are stored and computed in UTC." />
      <ProfileForm user={{ name: u.name, email: u.email, preferredMode: u.preferredMode ?? "planning", displayTimezone: u.displayTimezone, role: u.role }} />
    </div>
  );
}
