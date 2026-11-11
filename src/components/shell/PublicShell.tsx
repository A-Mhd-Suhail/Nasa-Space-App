import Link from "next/link";
import type { ReactNode } from "react";
import { currentUser } from "@/lib/dal";
import { LinkButton } from "../ui";
import { MoonNavGlyph, MoonNavMark } from "./Mark";
import { ModeToggle } from "./ModeToggle";
import { PerfPanel, PerfToggle } from "./PerfPanel";
import { ServiceBanner } from "./ServiceBanner";
import { PublicMobileNav, PublicNavLinks } from "./PublicMobileNav";
import { ThemeToggle } from "./ThemeToggle";

export const PUBLIC_NAV = [
  { href: "/explore", label: "Explore" },
  { href: "/learn", label: "Learn" },
  { href: "/methodology", label: "Methodology" },
  { href: "/sources", label: "Data sources" },
  { href: "/validation", label: "Validation" },
  { href: "/about", label: "About" },
];

export async function PublicShell({ children }: { children: ReactNode }) {
  const user = await currentUser().catch(() => null);
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/92 backdrop-blur-[6px]">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-6 px-4 sm:px-6">
          <div className="flex items-center gap-10">
            <MoonNavMark />
            <PublicNavLinks items={PUBLIC_NAV} />
          </div>
          <div className="flex items-center gap-2">
            <ModeToggle signedIn={!!user} compact className="hidden lg:flex" />
            <div className="hidden lg:block"><PerfToggle /></div>
            <div className="hidden lg:block"><ThemeToggle /></div>
            {user ? (
              <LinkButton href="/app" variant="primary" s="sm">Open workspace</LinkButton>
            ) : (
              <>
                <Link href="/login" className="hidden rounded-md px-3 py-1.5 text-sm text-text-2 hover:text-text sm:inline-block">Sign in</Link>
                <div className="hidden sm:block"><LinkButton href="/register" variant="primary" s="sm">Start planning</LinkButton></div>
              </>
            )}
            <PublicMobileNav items={PUBLIC_NAV} signedIn={!!user} />
          </div>
        </div>
      </header>
      <PerfPanel />
      <ServiceBanner />
      <main id="main" className="flex-1">{children}</main>
      <footer className="border-t border-line bg-bg-2">
        <div className="mx-auto grid max-w-[1240px] gap-10 px-4 py-12 text-sm sm:px-6 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5"><MoonNavGlyph /><span className="font-display text-xl">MoonNav</span></div>
            <p className="mt-4 max-w-sm leading-relaxed text-muted">
              An independent research and education prototype. Not NASA-owned, endorsed or flight-certified; it does not select approved landing sites.
              Built for the 2026 NASA Space Apps Challenge “Lunar Landing Site Navigator”.
            </p>
          </div>
          <FooterCol title="Product" links={[["/explore", "Explorer"], ["/learn", "Learn"], ["/register", "Create an account"], ["/about", "About"]]} />
          <FooterCol title="Science" links={[["/methodology", "Methodology"], ["/sources", "Data sources"], ["/limitations", "Known limitations"]]} />
          <FooterCol
            title="Legal"
            links={[["/privacy", "Privacy"], ["/terms", "Terms of use"]]}
            extra={
              <>
                <li><a className="hover:text-text" href="https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/" rel="noopener noreferrer" target="_blank">Challenge brief</a></li>
                {process.env.NEXT_PUBLIC_REPO_URL ? <li><a className="hover:text-text" href={process.env.NEXT_PUBLIC_REPO_URL} rel="noopener noreferrer" target="_blank">Source repository</a></li> : null}
              </>
            }
          />
        </div>
        <div className="border-t border-line">
          <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3 px-4 py-4 text-xs text-muted sm:px-6">
            <span>Terrain: NASA PDS LRO LOLA · Ephemerides: NASA/JPL NAIF SPICE · Names: IAU/USGS Gazetteer</span>
            <div className="lg:hidden"><ThemeToggle /></div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterCol({ title, links, extra }: { title: string; links: [string, string][]; extra?: ReactNode }) {
  return (
    <div>
      <div className="mb-3 text-[13px] font-semibold text-text">{title}</div>
      <ul className="space-y-2 text-muted">
        {links.map(([h, l]) => <li key={h}><Link className="hover:text-text" href={h}>{l}</Link></li>)}
        {extra}
      </ul>
    </div>
  );
}
