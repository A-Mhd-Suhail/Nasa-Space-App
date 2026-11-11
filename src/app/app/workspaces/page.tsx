import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui";
import { WorkspacesClient } from "@/components/workspace/WorkspacesClient";
import { currentWorkspace, listWorkspaces, requirePageUser } from "@/lib/dal";

export const metadata: Metadata = { title: "Workspaces" };

export default async function WorkspacesPage() {
  const u = await requirePageUser("/app/workspaces");
  const [all, cur] = await Promise.all([listWorkspaces(u), currentWorkspace(u)]);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader crumbs={[{ label: "Workspace", href: "/app" }, { label: "Workspaces" }]} title="Workspaces" description="Your personal field book is private. Shared workspaces let collaborators work on the same projects, scenarios, saved locations and reports: owners manage members, editors create and run, viewers read." />
      <Suspense fallback={<div className="h-32 animate-pulse rounded bg-panel-2" />}>
        <WorkspacesClient me={u.id} currentId={cur.id} workspaces={all.map((w) => ({ id: w.id, name: w.name, role: w.role, personal: w.personal, members: w.members }))} />
      </Suspense>
    </div>
  );
}
