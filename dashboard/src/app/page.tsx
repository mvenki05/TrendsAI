"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

interface HomeStats {
  reports: number;
  megatrends: number;
  webFinds: number;
  labIdeas: number;
}

const MODULES = [
  {
    href: "/megatrends",
    icon: "🏛️",
    title: "Megatrends",
    desc: "10 canonical trend dossiers, fully synthesized, cited, and demand-validated across all ingested sources.",
    bar: "from-emerald-500 to-sky-500",
    featured: true,
    img: "protein",
  },
  {
    href: "/lab",
    icon: "🔭",
    title: "White Space Scout",
    desc: "Novel product ideas surfaced from the open web, anchored to real Tyson categories, novelty-gated and demand-validated.",
    bar: "from-violet-500 to-indigo-500",
    featured: false,
  },
  {
    href: "/discover",
    icon: "🔍",
    title: "Web Discovery",
    desc: "Per-megatrend web harvest with US Market Radar, emerging signals, and Trends validation.",
    bar: "from-sky-500 to-cyan-400",
    featured: false,
  },
  {
    href: "/map",
    icon: "🗺️",
    title: "Trend Map",
    desc: "Our own bottom-up megatrend → subtrend → evidence map, deck-compared.",
    bar: "from-amber-500 to-orange-400",
    featured: false,
  },
  {
    href: "/ideas",
    icon: "💡",
    title: "Innovation Ideas",
    desc: "Tyson product concepts with permission tiers and emerging recipe signals.",
    bar: "from-rose-500 to-pink-400",
    featured: false,
  },
  {
    href: "/tyson",
    icon: "🐔",
    title: "Tyson Bites",
    desc: "Cross-document themes clustered from monthly digests, with corroboration scores and survey stats.",
    bar: "from-red-600 to-rose-500",
    featured: false,
  },
];

const SOURCES = [
  { href: "/mintel", icon: "📚", label: "Mintel" },
  { href: "/tyson", icon: "🐔", label: "Tyson Bites" },
  { href: "/reports", icon: "▣", label: "Reports" },
  { href: "/methodology", icon: "🧭", label: "Methodology" },
];

export default function HomePage() {
  const [stats, setStats] = useState<HomeStats | null>(null);

  useEffect(() => {
    fetch("/api/methodology")
      .then((r) => r.json())
      .then((d) => {
        const totalReports = Array.isArray(d.sources)
          ? d.sources.reduce((acc: number, s: { reports: number }) => acc + Number(s.reports ?? 0), 0)
          : 0;
        setStats({
          reports: totalReports,
          megatrends: Number(d.synthesis?.dossiers ?? 0),
          webFinds: Number(d.synthesis?.web_finds ?? 0),
          labIdeas: Number(d.synthesis?.lab_ideas ?? 0),
        });
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen">
      {/* ── Hero banner ──────────────────────────────────────────── */}
      <section className="relative h-[480px] overflow-hidden border-b border-slate-200">
        {/* Full-bleed background image */}
        <Image
          src="/hero.png"
          alt="TrendLens"
          fill
          className="object-cover object-center"
          sizes="100vw"
          priority
        />
        {/* Dark gradient overlay — heavier on the left so text pops */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-black/10" />
        {/* Bottom fade to page bg */}
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#FAF9F6] to-transparent" />

        {/* Text content */}
        <div className="relative flex h-full flex-col justify-center px-12 lg:px-16">
          <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-white/80 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Tyson Foods · Innovation Intelligence
          </div>

          <h1 className="font-display text-[60px] font-semibold leading-[1.04] tracking-tight text-white">
            TrendLens
          </h1>

          <p className="mt-4 max-w-[480px] text-[17px] leading-relaxed text-white/70">
            From agency decks to real-time demand signals, synthesized into navigable intelligence.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/megatrends"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-md transition hover:bg-slate-100"
            >
              Explore Megatrends <span aria-hidden>→</span>
            </Link>
            <Link
              href="/lab"
              className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
            >
              White Space Scout <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Stats strip ──────────────────────────────────────────── */}
      {stats && (
        <section className="border-b border-slate-200 bg-white/70 px-8 py-5">
          <div className="mx-auto flex max-w-6xl items-stretch divide-x divide-slate-200">
            {[
              { value: stats.reports, label: "Reports ingested" },
              { value: stats.megatrends, label: "Megatrends tracked" },
              { value: stats.webFinds, label: "Web signals harvested" },
              { value: stats.labIdeas, label: "White-space ideas" },
            ].map(({ value, label }) => (
              <div key={label} className="flex flex-col justify-center px-8 first:pl-0 last:pr-0">
                <div className="text-[26px] font-bold tabular-nums text-slate-900">{value}</div>
                <div className="mt-0.5 text-[11.5px] text-slate-500">{label}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Feature cards ────────────────────────────────────────── */}
      <section className="px-8 py-10">
        <div className="mx-auto max-w-6xl">
          <p className="mb-7 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
            Explore
          </p>

          {/* Featured row: Megatrends (large) + White Space */}
          <div className="mb-4 grid grid-cols-3 gap-4">
            {/* Megatrends — spans 2 cols, image-backed */}
            <Link
              href="/megatrends"
              className="group relative col-span-2 flex min-h-[220px] flex-col overflow-hidden rounded-2xl shadow-sm transition hover:shadow-lg hover:-translate-y-0.5"
            >
              <Image
                src="/megatrends/protein.png"
                alt="Megatrends"
                fill
                className="object-cover transition duration-500 group-hover:scale-105"
                sizes="(max-width: 768px) 100vw, 66vw"
              />
              <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/40 to-black/20" />
              <div className="relative flex flex-1 flex-col justify-between p-7">
                <div>
                  <span className="text-2xl">🏛️</span>
                  <h3 className="mt-3 font-display text-2xl font-semibold text-white">
                    Megatrends
                  </h3>
                  <p className="mt-2 max-w-xs text-[13.5px] leading-relaxed text-white/75">
                    10 canonical trend dossiers, fully synthesized, cited, and demand-validated across all ingested sources.
                  </p>
                </div>
                <div className="mt-6 inline-flex items-center gap-1.5 text-[12px] font-semibold text-white/80 transition group-hover:text-white">
                  Open dossiers <span aria-hidden>→</span>
                </div>
              </div>
            </Link>

            {/* White Space */}
            <Link
              href="/lab"
              className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md hover:-translate-y-0.5"
            >
              <div className="h-1.5 w-full bg-gradient-to-r from-violet-500 to-indigo-500" />
              <div className="flex flex-1 flex-col p-6">
                <span className="text-2xl">🔭</span>
                <h3 className="mt-3 font-display text-[18px] font-semibold text-slate-900">
                  White Space Scout
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
                  Novel product ideas surfaced from the open web, anchored to real Tyson categories, novelty-gated and demand-validated.
                </p>
                <div className="mt-auto pt-5 text-[12px] font-semibold text-slate-400 transition group-hover:text-slate-700">
                  Explore ideas →
                </div>
              </div>
            </Link>
          </div>

          {/* Secondary row: 4 image-backed cards */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { href: "/discover", title: "Web Discovery",    desc: "Per-megatrend web harvest, Trends-validated.",          img: "/subtrends/blur-0.png" },
              { href: "/map",      title: "Trend Map",        desc: "Bottom-up megatrend → subtrend → evidence map.",        img: "/subtrends/flavor-0.png" },
              { href: "/ideas",    title: "Innovation Ideas", desc: "Tyson product concepts with permission tiers.",          img: "/subtrends/convenience-4.png" },
              { href: "/tyson",    title: "Tyson Bites",      desc: "Cross-digest themes with corroboration scores.",         img: "/subtrends/protein-0.png" },
            ].map((m) => (
              <Link
                key={m.href}
                href={m.href}
                className="group relative flex min-h-[180px] flex-col overflow-hidden rounded-2xl shadow-sm transition hover:shadow-lg hover:-translate-y-0.5"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.img} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/10" />
                <div className="relative flex flex-1 flex-col justify-end p-5">
                  <h3 className="font-display text-[15px] font-semibold text-white">{m.title}</h3>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-white/65">{m.desc}</p>
                  <div className="mt-3 text-[11px] font-semibold text-white/50 transition group-hover:text-white/90">
                    Open →
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Sources bar ──────────────────────────────────────────── */}
      <section className="border-t border-slate-200 px-8 py-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          <span className="mr-2 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
            Source libraries
          </span>
          {SOURCES.map(({ href, icon, label }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[12px] font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
            >
              <span>{icon}</span>
              {label}
            </Link>
          ))}
        </div>
      </section>

      {/* ── Floating methodology button ───────────────────────────── */}
      <Link
        href="/methodology"
        className="fixed bottom-6 right-6 z-50 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-[12px] font-semibold text-slate-600 shadow-lg transition hover:bg-slate-50 hover:text-slate-900 hover:shadow-xl"
      >
        <span className="text-base">🧭</span>
        How TrendLens works
      </Link>
    </div>
  );
}
