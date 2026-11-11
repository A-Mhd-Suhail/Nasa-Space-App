import { AppShell } from "@/components/shell/AppShell";
import { requirePageRole } from "@/lib/dal";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageRole("curator", "/admin");
  return <AppShell user={user}>{children}</AppShell>;
}
