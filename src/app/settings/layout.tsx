import { AppShell } from "@/components/shell/AppShell";
import { requirePageUser } from "@/lib/dal";

export const dynamic = "force-dynamic";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser("/settings/profile");
  return <AppShell user={user}>{children}</AppShell>;
}
