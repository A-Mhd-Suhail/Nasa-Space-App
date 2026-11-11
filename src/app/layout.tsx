import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import { MotionRoot } from "@/components/shell/MotionRoot";
import "./globals.css";

const sans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const serif = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], weight: ["400", "500", "600"], style: ["normal"], display: "swap" });
const mono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "MoonNav — Lunar south-pole site navigator", template: "%s · MoonNav" },
  description:
    "Compare lunar south-pole sites and dates by terrain-aware sunlight and geometric Earth visibility, computed from NASA LOLA terrain and NAIF SPICE ephemerides.",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f0e7" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1a17" },
  ],
};

// Resolve the theme before first paint (stored preference, else light — the product is light-first).
const THEME_BOOT = `(function(){try{var p=localStorage.getItem('moonnav-theme')||'light';var t=p==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p;document.documentElement.dataset.theme=t;document.documentElement.dataset.themePref=p;}catch(e){document.documentElement.dataset.theme='light';}})();`;

// Resolve Simple / Advanced display mode before first paint (stored preference, else Simple).
const MODE_BOOT = `(function(){try{var m=localStorage.getItem('moonnav-mode');document.documentElement.dataset.mode=m==='advanced'?'advanced':'simple';}catch(e){document.documentElement.dataset.mode='simple';}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" data-mode="simple" suppressHydrationWarning className={`${sans.variable} ${serif.variable} ${mono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <script dangerouslySetInnerHTML={{ __html: MODE_BOOT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-ink">
          Skip to content
        </a>
        <MotionRoot>{children}</MotionRoot>
      </body>
    </html>
  );
}
