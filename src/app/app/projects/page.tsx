import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { ProjectsClient } from "@/components/workspace/ProjectsClient";
import { requirePageUser } from "@/lib/dal";
import { listProjects } from "@/lib/services";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const u = await requirePageUser("/app/projects");
  const projects = await listProjects(u, true);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Projects" description="Projects group the scenarios, analyses and comparisons for one study." />
      <ProjectsClient initial={projects.map((p) => ({ id: p.id, name: p.name, description: p.description, status: p.status, scenarioCount: p.scenarioCount, updatedAt: p.updatedAt.toISOString() }))} />
    </div>
  );
}
