import type { ReactNode } from "react";
import { currentWorkspace, listWorkspaces, type SessionUser } from "@/lib/dal";
import { isDemoUser } from "@/lib/demo";
import { MoonNavMark } from "./Mark";
import { ModeToggle } from "./ModeToggle";
import { PerfPanel, PerfToggle } from "./PerfPanel";
import { AppSidebar, MobileAppNav } from "./AppNav";
import { CommandPalette } from "./CommandPalette";
import { DataStatus } from "./DataStatus";
import { ProfileMenu } from "./ProfileMenu";
import { Providers } from "./Providers";
import { ThemeToggle } from "./ThemeToggle";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

export async function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const [workspaces, current] = await Promise.all([listWorkspaces(user), currentWorkspace(user)]);
  return (
    <Providers>
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-line bg-bg/94 px-3 backdrop-blur-[6px] sm:px-4">
          <MobileAppNav role={user.role} />
          <MoonNavMark href="/app" />
          <span aria-hidden className="hidden h-6 w-px bg-line md:block" />
          <div className="hidden md:block">
            <WorkspaceSwitcher workspaces={workspaces.map((w) => ({ id: w.id, name: w.name, role: w.role, personal: w.personal }))} currentId={current.id} />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ModeToggle signedIn compact className="hidden lg:flex" />
            <div className="hidden lg:block"><PerfToggle /></div>
            <CommandPalette />
            <DataStatus />
            <div className="hidden lg:block"><ThemeToggle /></div>
            <ProfileMenu name={user.name} email={user.email} role={user.role} />
          </div>
        </header>
        {isDemoUser(user) && (
          <div className="no-print border-b border-line bg-accent-soft px-4 py-1.5 text-center text-[13px] text-text-2" data-testid="demo-banner">
            Demo workspace — private to this browser session, pre-seeded with precomputed analyses, deleted after 24 h. <a href="/register" className="text-accent underline">Create a free account</a> to keep your work.
          </div>
        )}
        <div className="flex flex-1">
          <AppSidebar role={user.role} />
          <main id="main" className="min-w-0 flex-1 px-4 pb-16 pt-7 sm:px-6 lg:px-10">{children}</main>
        </div>
      </div>
      <PerfPanel />
    </Providers>
  );
}
