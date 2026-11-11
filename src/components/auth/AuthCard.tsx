import type { ReactNode } from "react";

/** Authentication frame: form sheet on the left, a LOLA relief plate on wide screens. */
export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-[1240px] items-stretch gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,460px)_1fr] lg:py-16">
      <div className="flex flex-col justify-center">
        <div className="rounded-[8px] border border-line bg-panel p-6 shadow-[var(--shadow-sheet)] sm:p-9">
          <h1 className="font-display text-[30px] font-medium leading-tight">{title}</h1>
          {subtitle ? <p className="mt-2 text-[15px] leading-relaxed text-text-2">{subtitle}</p> : null}
          <div className="mt-7">{children}</div>
        </div>
        {footer ? <p className="mt-5 text-center text-sm text-text-2">{footer}</p> : null}
      </div>
      <figure aria-hidden className="relative hidden overflow-hidden rounded-[8px] border border-line bg-panel-2 lg:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/data/lola_75s_240m_hillshade.webp" alt="" className="absolute inset-0 h-full w-full scale-[1.9] object-cover opacity-90 mix-blend-multiply [[data-theme=dark]_&]:opacity-55 [[data-theme=dark]_&]:mix-blend-screen" />
        <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-panel via-panel/85 to-transparent px-8 pb-8 pt-24">
          <p className="max-w-md font-display text-[22px] leading-snug text-text">Every number in MoonNav says where it came from: source data, calculated, modelled — or unknown.</p>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">LOLA LDEM_75S_240M relief · south polar stereographic</p>
        </figcaption>
      </figure>
    </div>
  );
}
