"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { PresentMode } from "@/components/present-mode";

// Scroll-reveal: content glides up into place the first time it enters the viewport.
function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ob = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setShown(true); ob.disconnect(); } },
      { threshold: 0.1, rootMargin: "0px 0px -8% 0px" },
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, []);
  return (
    <div ref={ref}
         className={`${className ?? ""} transition-all duration-700 ease-out will-change-transform ${shown ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0"}`}>
      {children}
    </div>
  );
}

interface Cite {
  kind: "report" | "web";
  report_id?: string;
  url?: string;
  label?: string;
  page?: number;
}

interface Opportunity {
  name: string;
  concept: string;
  why_now?: string;
  builds_on?: string[];
  tyson_fit?: { category?: string; tier?: "Core" | "Adjacent" | "Stretch"; reason?: string };
}

interface CitedSegment { text: string; cite?: Cite | null }

interface Dossier {
  key: string;
  name: string;
  tagline: string;
  definition: string;
  definition_cited?: CitedSegment[];
  why_it_matters_to_tyson: string;
  now: string;
  now_cited?: CitedSegment[];
  key_stats: { stat: string; cite?: Cite }[];
  subtrends: { name: string; description: string; geo?: string | null;
    opportunities?: Opportunity[];
    evidence: { level: string; name: string; detail?: string; cite?: Cite }[] }[];
  horizons: Record<"short" | "medium" | "long", { title: string; detail: string; rationale: string; cite?: Cite }[]>;
  demand: { summary: string; risers: { term: string; yoy: number }[]; decliners: { term: string; yoy: number }[] };
  tyson_questions: (string | { question: string; cite?: Cite | null })[];
  tyson_portfolio: { brand: string; name: string }[];
  tyson_ideas: { name: string; brand?: string; tier?: string; format?: string; occasion?: string; note?: string; validation?: string; subtrend?: string; cites?: Cite[] }[];
  whitespace: { name: string; note?: string; cite?: Cite }[];
  sources: { kind: string; report_id?: string; label: string; source_tag?: string }[];
}

interface CodexRow {
  key: string;
  name: string;
  tagline: string | null;
  rank: number | null;
  strength: string | null;
  dossier: string | null;
}

const THEME: Record<string, { dot: string; grad: string; ring: string; bar: string; tint: string; num: string }> = {
  protein:     { dot: "bg-red-500",     grad: "from-red-600 to-rose-500",      ring: "ring-red-200",    bar: "bg-red-500",     tint: "from-red-50 to-white",     num: "text-red-100"     },
  value:       { dot: "bg-amber-500",   grad: "from-amber-600 to-orange-500",  ring: "ring-amber-200",  bar: "bg-amber-500",   tint: "from-amber-50 to-white",   num: "text-amber-100"   },
  cleanlabel:  { dot: "bg-emerald-500", grad: "from-emerald-600 to-teal-500",  ring: "ring-emerald-200",bar: "bg-emerald-500", tint: "from-emerald-50 to-white", num: "text-emerald-100" },
  glp1:        { dot: "bg-purple-500",  grad: "from-purple-600 to-fuchsia-500",ring: "ring-purple-200", bar: "bg-purple-500",  tint: "from-purple-50 to-white",  num: "text-purple-100"  },
  blur:        { dot: "bg-sky-500",     grad: "from-sky-600 to-cyan-500",      ring: "ring-sky-200",    bar: "bg-sky-500",     tint: "from-sky-50 to-white",     num: "text-sky-100"     },
  convenience: { dot: "bg-teal-500",    grad: "from-teal-600 to-emerald-500",  ring: "ring-teal-200",   bar: "bg-teal-500",    tint: "from-teal-50 to-white",    num: "text-teal-100"    },
  flavor:      { dot: "bg-orange-500",  grad: "from-orange-600 to-amber-500",  ring: "ring-orange-200", bar: "bg-orange-500",  tint: "from-orange-50 to-white",  num: "text-orange-100"  },
  functional:  { dot: "bg-lime-600",    grad: "from-lime-600 to-green-500",    ring: "ring-lime-200",   bar: "bg-lime-500",    tint: "from-lime-50 to-white",    num: "text-lime-100"    },
  conscious:   { dot: "bg-green-600",   grad: "from-green-700 to-emerald-500", ring: "ring-green-200",  bar: "bg-green-600",   tint: "from-green-50 to-white",   num: "text-green-100"   },
  social:      { dot: "bg-indigo-500",  grad: "from-indigo-600 to-violet-500", ring: "ring-indigo-200", bar: "bg-indigo-500",  tint: "from-indigo-50 to-white",  num: "text-indigo-100"  },
};

const TAG_STYLE: Record<string, string> = {
  deck: "bg-slate-200 text-slate-700", mintel: "bg-sky-100 text-sky-700", tyson: "bg-emerald-100 text-emerald-700",
};

// Same permission-tier vocabulary as the Innovation Ideas page.
const TIER_STYLE: Record<string, { badge: string; icon: string }> = {
  Core:     { badge: "bg-emerald-100 text-emerald-700", icon: "✓" },
  Adjacent: { badge: "bg-sky-100 text-sky-700", icon: "◆" },
  Stretch:  { badge: "bg-orange-100 text-orange-700", icon: "⚑" },
};

// Stable identity for a citation: same doc+page (or same URL) = same reference number.
function citeKey(cite?: Cite): string | null {
  if (!cite) return null;
  if (cite.kind === "web" && cite.url) return `w|${cite.url}`;
  if (cite.report_id) return `r|${cite.report_id}|${cite.page ?? ""}`;
  return null;
}

function citeHref(cite: Cite): string | null {
  if (cite.kind === "web" && cite.url) return cite.url;
  if (cite.report_id) return `/api/file/${cite.report_id}${cite.page ? `#page=${cite.page}` : ""}`;
  return null;
}

// Numbered superscript reference, academic style: [3]. Click opens the source directly;
// the full listing lives in the numbered References section at the bottom of the dossier.
function CiteLink({ cite, refNo }: { cite?: Cite; refNo?: number }) {
  if (!cite) return null;
  const href = citeHref(cite);
  const title = cite.kind === "web"
    ? `${cite.label || "External source"} — ${cite.url}`
    : `${cite.label || "Source document"}${cite.page ? ` · page ${cite.page}` : ""}`;
  if (href && refNo) {
    return (
      <a href={href} target="_blank" rel="noreferrer" title={title}
         className="align-super text-[10.5px] font-extrabold text-sky-600 hover:text-sky-800 hover:underline">
        [{refNo}]
      </a>
    );
  }
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" title={title}
         className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-200">
        {cite.kind === "web" ? "↗" : "📄"} {cite.label || "source"}
      </a>
    );
  }
  return <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">{cite.label}</span>;
}

// Editorial numbered section header: "01 — EYEBROW" over a serif title.
function SectionTitle({ children, tone = "text-slate-900" }: {
  no?: string; eyebrow?: string; children: React.ReactNode; tone?: string;
}) {
  return <h3 className={`text-[26px] font-semibold tracking-tight ${tone}`}>{children}</h3>;
}

function HorizonColumn({ title, sub, items, tone, refFor }: {
  title: string; sub: string; tone: string;
  items: { title: string; detail: string; rationale: string; cite?: Cite }[];
  refFor: (c?: Cite) => number | undefined;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <div className={`font-display text-2xl font-semibold ${tone}`}>{title}</div>
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{sub}</div>
      </div>
      <div className="mt-4 space-y-4 divide-y divide-slate-100">
        {items?.map((h, i) => (
          <div key={i} className={i > 0 ? "pt-4" : ""}>
            <span className="text-[15px] font-bold text-slate-900">{h.title} <CiteLink cite={h.cite} refNo={refFor(h.cite)} /></span>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{h.detail}</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-slate-400">
              <span className={`font-bold ${tone}`}>Why this horizon —</span> {h.rationale}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CodexPage() {
  const [rows, setRows] = useState<CodexRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState<number | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [selectedSub, setSelectedSub] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);

  // Reset subtrend selection when switching megatrends
  useEffect(() => {
    setSelectedSub(0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [selected]);

  const jumpToSubtrend = (i: number) => {
    setSelectedSub(i);
    document.getElementById("sec-subtrends")?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => document.getElementById(`subtrend-card-${i}`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" }), 300);
  };

  const load = useCallback(() => {
    fetch("/api/codex")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.megatrends)) {
          setRows(d.megatrends);
          if (d.megatrends.length > 0) setSelected((s) => s ?? d.megatrends[0].key);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const row = rows.find((r) => r.key === selected);
  const dossier: Dossier | null = row?.dossier ? JSON.parse(row.dossier) : null;
  const strength = row?.strength ? JSON.parse(row.strength) : null;

  // Numbered references, assigned in display order (horizons → subtrends → stats → whitespace).
  // Same document+page (or URL) always resolves to the same number.
  const refMap = new Map<string, number>();
  const refList: { n: number; cite: Cite }[] = [];
  if (dossier) {
    const add = (c?: Cite) => {
      const k = citeKey(c);
      if (!k || !c || refMap.has(k)) return;
      refMap.set(k, refMap.size + 1);
      refList.push({ n: refMap.size, cite: c });
    };
    dossier.definition_cited?.forEach((s) => s.cite && add(s.cite));
    dossier.now_cited?.forEach((s) => s.cite && add(s.cite));
    (["short", "medium", "long"] as const).forEach((h) => dossier.horizons?.[h]?.forEach((i) => add(i.cite)));
    dossier.subtrends?.forEach((s) => s.evidence?.forEach((e) => add(e.cite)));
    dossier.key_stats?.forEach((s) => add(s.cite));
    dossier.tyson_questions?.forEach((q) => { if (typeof q !== "string" && q.cite) add(q.cite); });
    dossier.whitespace?.forEach((w) => add(w.cite));
  }
  const refFor = (c?: Cite) => { const k = citeKey(c); return k ? refMap.get(k) : undefined; };

  // Prose with inline evidence: renders cited segments with [n] superscripts (falls back to plain text).
  const CitedProse = ({ segments, fallback, dark = false }: { segments?: CitedSegment[]; fallback: string; dark?: boolean }) => {
    if (!segments?.length) return <>{fallback}</>;
    return (
      <>
        {segments.map((seg, i) => {
          const n = seg.cite ? refFor(seg.cite) : undefined;
          const href = seg.cite ? citeHref(seg.cite) : null;
          return (
            <span key={i}>
              {seg.text}
              {n && href && (
                <a href={href} target="_blank" rel="noreferrer"
                   title={`${seg.cite!.label || "source"}${seg.cite!.page ? ` · p.${seg.cite!.page}` : ""}`}
                   className={`align-super text-[10.5px] font-extrabold hover:underline ${dark ? "text-sky-300 hover:text-sky-200" : "text-sky-600 hover:text-sky-800"}`}>
                  [{n}]
                </a>
              )}
            </span>
          );
        })}
      </>
    );
  };
  const theme = THEME[selected ?? ""] ?? { dot: "bg-slate-500", grad: "from-slate-700 to-slate-500", ring: "ring-slate-200" };

  return (
    <div className="flex min-h-screen">
      {/* ── Built-in megatrend selector panel ───────────────────── */}
      <aside className="fixed left-0 top-12 z-10 flex h-[calc(100vh-3rem)] w-[220px] flex-col border-r border-slate-200 bg-[#FAF9F6]">
        {/* Megatrend image cards */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-2 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
          {rows.map((r) => {
            const isActive = selected === r.key;
            return (
              <div key={r.key}>
                <button
                  onClick={() => { setSelected(r.key); setFlash(null); }}
                  className={`group relative w-full overflow-hidden rounded-xl text-left transition ${
                    isActive
                      ? "ring-2 ring-slate-900 shadow-md"
                      : "border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300"
                  }`}
                >
                  <div className="relative h-[72px]">
                    <Image
                      src={`/megatrends/${r.key}.png`}
                      alt={r.name}
                      fill
                      className="object-cover transition duration-300 group-hover:scale-105"
                      sizes="196px"
                    />
                    <div className={`absolute inset-0 bg-gradient-to-t ${isActive ? "from-black/80 via-black/40" : "from-black/65 via-black/20"} to-transparent`} />
                    <span className="absolute bottom-2.5 left-3 right-3 text-[11.5px] font-semibold leading-tight text-white line-clamp-2">
                      {r.name}
                    </span>
                  </div>
                </button>

                {/* Section links — expand below the active card */}
                {isActive && (
                  <div className="space-y-0.5 px-1 pb-1">
                    {[
                      { id: "sec-now",       label: "What's happening now" },
                      { id: "sec-horizons",  label: "Horizons" },
                      { id: "sec-subtrends", label: "Subtrends" },
                      { id: "sec-stats",     label: "Key Stats" },
                      { id: "sec-tyson",     label: "Tyson Layer" },
                      { id: "sec-sources",   label: "Sources" },
                    ].map(({ id, label }) => (
                      <button key={id}
                        onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[12px] font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900">
                        <span className="h-1 w-1 flex-shrink-0 rounded-full bg-slate-600" />
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      {/* ── Dossier content ─────────────────────────────────────── */}
      <div className="ml-[220px] min-w-0 flex-1">
      {dossier && presenting && (
        <PresentMode dossier={dossier} imageSrc={`/megatrends/${selected}.png`}
                     rank={row?.rank} total={rows.length} onClose={() => setPresenting(false)} />
      )}

      {loading && (
        <div className="flex h-64 items-center justify-center text-lg text-slate-400">Loading…</div>
      )}

      {!loading && rows.length === 0 && (
        <div className="flex h-64 items-center justify-center p-12 text-slate-400">
          No megatrends have been synthesized yet.
        </div>
      )}

      {dossier && (
        <div key={selected} className="space-y-6 p-6 lg:p-8">
            <div className="space-y-6">
              {/* Hero — editorial image with scrim, gradient fallback */}
              <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${theme.grad} text-white shadow-lg`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/megatrends/${selected}.png`} alt=""
                     className="absolute inset-0 h-full w-full object-cover"
                     onError={(e) => { e.currentTarget.style.display = "none"; }} />
                <div className="absolute inset-0 bg-gradient-to-r from-slate-950/85 via-slate-950/55 to-slate-950/15" />
                <div className="relative px-8 pb-8 pt-12 lg:px-10">
                  <button onClick={() => setPresenting(true)}
                          title="Full-screen slide presentation of this dossier"
                          className="absolute right-8 top-8 rounded-full border border-white/30 bg-white/10 px-4 py-2 text-[13px] font-bold backdrop-blur transition hover:scale-105 hover:bg-white/25">
                    ▶ Present
                  </button>
                  <h2 className="mt-2 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight lg:text-5xl">{dossier.name}</h2>
                  <p className="mt-3 max-w-2xl text-lg font-medium leading-snug text-white/85">{dossier.tagline}</p>
                  <p className="mt-5 max-w-3xl text-[15.5px] leading-relaxed text-white/90">
                    <CitedProse segments={dossier.definition_cited} fallback={dossier.definition} dark />
                  </p>
                  {strength && (
                    <div className="mt-7 flex flex-wrap gap-3">
                      {[
                        [String(strength.report_count), "corroborating reports"],
                        ...(strength.month_count > 0 ? [[String(strength.month_count), "months persistent"]] : []),
                      ].map(([v, l]) => (
                        <div key={l} className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 backdrop-blur-sm">
                          <div className="font-display text-xl font-semibold leading-none">{v}</div>
                          <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">{l}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="relative bg-black/40 px-8 py-4 backdrop-blur-[2px]">
                  <p className="text-[15px] leading-relaxed">
                    <span className="mr-2 rounded bg-white/25 px-2 py-0.5 text-xs font-extrabold uppercase tracking-wider">Why it matters to Tyson</span>
                    {dossier.why_it_matters_to_tyson}
                  </p>
                </div>
              </div>

              {/* Now + demand side by side */}
              <Reveal>
              <div id="sec-now" className="grid scroll-mt-24 grid-cols-1 gap-4 lg:grid-cols-5">
                <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm lg:col-span-3">
                  <SectionTitle no="01" eyebrow="The present">What&apos;s happening now</SectionTitle>
                  <p className="mt-4 text-[15px] leading-[1.75] text-slate-700">
                    <CitedProse segments={dossier.now_cited} fallback={dossier.now} />
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm lg:col-span-2">
                  <SectionTitle no="02" eyebrow="Google Trends · YoY">Measured demand</SectionTitle>
                  <p className="mt-4 text-[13px] leading-relaxed text-slate-500">{dossier.demand?.summary}</p>
                  {(() => {
                    const risers = dossier.demand?.risers ?? [];
                    const decliners = dossier.demand?.decliners ?? [];
                    const maxAbs = Math.max(1, ...risers.map((r) => Math.abs(r.yoy)), ...decliners.map((r) => Math.abs(r.yoy)));
                    const Bar = ({ term, yoy, up }: { term: string; yoy: number; up: boolean }) => (
                      <div className="flex items-center gap-2.5">
                        <span className="w-32 shrink-0 truncate text-[12.5px] font-semibold text-slate-700" title={term}>{term}</span>
                        <div className="h-[7px] flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div className={`h-full rounded-full ${up ? "bg-emerald-500" : "bg-rose-400"}`}
                               style={{ width: `${Math.max(6, (Math.abs(yoy) / maxAbs) * 100)}%` }} />
                        </div>
                        <span className={`w-12 shrink-0 text-right text-[12px] font-bold tabular-nums ${up ? "text-emerald-600" : "text-rose-500"}`}>
                          {up ? "+" : ""}{Math.round(yoy)}%
                        </span>
                      </div>
                    );
                    return (
                      <div className="mt-4 space-y-1.5">
                        {risers.map((r, i) => <Bar key={`r${i}`} term={r.term} yoy={r.yoy} up />)}
                        {decliners.map((r, i) => <Bar key={`d${i}`} term={r.term} yoy={r.yoy} up={false} />)}
                      </div>
                    );
                  })()}
                </div>
              </div>
              </Reveal>

              {/* Horizons */}
              <Reveal>
              <div id="sec-horizons" className="scroll-mt-24">
                <SectionTitle no="03" eyebrow="Where this goes">The horizons</SectionTitle>
                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <HorizonColumn title="Now" sub="0–12 mo · act" tone="text-rose-600" items={dossier.horizons?.short ?? []} refFor={refFor} />
                  <HorizonColumn title="Next" sub="1–3 yr · develop" tone="text-amber-600" items={dossier.horizons?.medium ?? []} refFor={refFor} />
                  <HorizonColumn title="Later" sub="3+ yr · position" tone="text-sky-600" items={dossier.horizons?.long ?? []} refFor={refFor} />
                </div>
              </div>
              </Reveal>

              {/* Subtrends */}
              <div id="sec-subtrends" className="scroll-mt-24">
                <Reveal>
                <SectionTitle no="04" eyebrow="The anatomy">Subtrends &amp; opportunities</SectionTitle>
                </Reveal>
                {/* Carousel track */}
                <div className="relative mt-4">
                  <div className="absolute -top-10 right-0 flex gap-1.5 z-10">
                    <button
                      onClick={() => carouselRef.current?.scrollBy({ left: -296, behavior: "smooth" })}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900 transition text-lg leading-none"
                    >‹</button>
                    <button
                      onClick={() => carouselRef.current?.scrollBy({ left: 296, behavior: "smooth" })}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900 transition text-lg leading-none"
                    >›</button>
                  </div>
                  <div ref={carouselRef}
                       className="flex gap-3.5 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-3 [&::-webkit-scrollbar]:hidden">
                    {dossier.subtrends?.map((s, i) => {
                      const isSel = selectedSub === i;
                      return (
                        <div key={i} id={`subtrend-card-${i}`}
                             onClick={() => setSelectedSub(i)}
                             className={`w-[268px] flex-none snap-start cursor-pointer rounded-2xl overflow-hidden transition-all duration-300 select-none
                               ${isSel ? `ring-2 ${theme.ring} shadow-xl` : "border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300"}`}>
                          <div className={`relative overflow-hidden bg-gradient-to-br ${theme.grad} h-[160px]`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/subtrends/${selected}-${i}.png`} alt=""
                                 className="absolute inset-0 h-full w-full object-cover"
                                 onError={(e) => { e.currentTarget.style.display = "none"; }} />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />
                            <div className="relative z-10 flex h-full flex-col justify-end px-5 pb-4 pt-5">
                              <h5 className="text-[15px] font-bold leading-snug text-white pr-2 line-clamp-3">{s.name}</h5>
                              {s.geo && (
                                <span className="mt-2 inline-block rounded-full bg-white/25 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-white/90 leading-tight">
                                  {s.geo.charAt(0).toUpperCase() + s.geo.slice(1)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="bg-white px-5 py-4">
                            <p className="text-[12px] leading-relaxed text-slate-500 line-clamp-3">{s.description}</p>
                            {s.opportunities?.[0] && (
                              <div className="mt-3 border-t border-slate-100 pt-3">
                                <p className="mb-1 text-[9px] font-extrabold uppercase tracking-[0.2em] text-sky-500">Top opportunity</p>
                                <p className="text-[12.5px] font-semibold leading-snug text-slate-800 line-clamp-2">{s.opportunities[0].name}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Detail panel — full content for selected subtrend */}
                {(() => {
                  const s = dossier.subtrends?.[selectedSub];
                  if (!s) return null;
                  const byLevel = (lvl: string) => s.evidence?.filter((e) => e.level === lvl) ?? [];
                  const psychs = byLevel("psychographic"), behs = byLevel("behaviour");
                  const other = s.evidence?.filter((e) => !["psychographic", "behaviour", "product", "ingredient"].includes(e.level)) ?? [];
                  const hasConsumer = psychs.length + behs.length > 0;
                  const Bullets = ({ items, tone }: { items: typeof psychs; tone: string }) => (
                    <ul className="mt-1.5 space-y-1.5">
                      {items.map((e, k) => (
                        <li key={k} className="flex gap-2">
                          <span className={`shrink-0 font-bold ${tone}`}>•</span>
                          <div className="min-w-0 text-[13.5px] leading-snug text-slate-800">
                            <span className="font-bold">{e.name}</span> <CiteLink cite={e.cite} refNo={refFor(e.cite)} />
                            {e.detail && <div className="mt-0.5 text-[12px] leading-relaxed text-slate-500">{e.detail}</div>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  );
                  const opps = s.opportunities ?? [];
                  const citeByName = new Map<string, Cite | undefined>();
                  s.evidence?.forEach((e) => citeByName.set((e.name || "").trim().toLowerCase(), e.cite));
                  const citeForBuild = (b: string) => citeByName.get(b.trim().toLowerCase());
                  return (
                    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                      <div className="px-7 py-5">
                        <div className={`grid grid-cols-1 gap-7 ${hasConsumer ? "lg:grid-cols-5" : ""}`}>
                          {opps.length > 0 && (
                            <div className={hasConsumer ? "lg:col-span-3" : ""}>
                              <p className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.18em] text-sky-600">
                                <span className="h-1.5 w-1.5 rounded-full bg-sky-500" /> The opportunity
                              </p>
                              <div className="mt-3 space-y-3">
                                {opps.map((o, k) => {
                                  const tier = o.tyson_fit?.tier ?? "Adjacent";
                                  const ts = TIER_STYLE[tier] ?? TIER_STYLE.Adjacent;
                                  const buildsOn = Array.isArray(o.builds_on) ? o.builds_on : [];
                                  const oppRefs = [...new Set(buildsOn
                                    .map((b) => refFor(citeForBuild(b)))
                                    .filter((n): n is number => n !== undefined))].sort((a, b) => a - b);
                                  return (
                                    <div key={k} className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/60 p-4 shadow-sm">
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="text-[15.5px] font-bold text-slate-900">
                                          {o.name}
                                          {oppRefs.map((n) => {
                                            const rc = refList[n - 1]?.cite;
                                            const href = rc ? citeHref(rc) : null;
                                            return href ? (
                                              <a key={n} href={href} target="_blank" rel="noreferrer"
                                                 title={`${rc!.label || "source"}${rc!.page ? ` · p.${rc!.page}` : ""}`}
                                                 className="ml-1 align-super text-[10.5px] font-extrabold text-sky-600 hover:text-sky-800 hover:underline">
                                                [{n}]
                                              </a>
                                            ) : null;
                                          })}
                                        </span>
                                        <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${ts.badge}`}
                                              title={o.tyson_fit?.reason ?? undefined}>
                                          {ts.icon} {tier}
                                        </span>
                                      </div>
                                      <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-700">{o.concept}</p>
                                      {o.why_now && (
                                        <p className="mt-1.5 text-[12px] leading-relaxed text-slate-500">
                                          <span className="font-bold text-rose-500">Why now —</span> {o.why_now}
                                        </p>
                                      )}
                                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2.5">
                                        {o.tyson_fit?.category && (
                                          <span className="rounded bg-slate-900 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-white"
                                                title={o.tyson_fit?.reason ?? "Tyson category anchor"}>
                                            🐔 {o.tyson_fit.category}
                                          </span>
                                        )}
                                        {buildsOn.map((b, bi) => (
                                          <span key={bi} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
                                            ↳ {b} <CiteLink cite={citeForBuild(b)} refNo={refFor(citeForBuild(b))} />
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          {hasConsumer && (
                            <div className={opps.length > 0 ? "lg:col-span-2" : "lg:col-span-5"}>
                              <p className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.18em] text-violet-600">
                                <span className="h-1.5 w-1.5 rounded-full bg-violet-500" /> The consumer
                              </p>
                              {psychs.length > 0 && (
                                <div className="mt-3">
                                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Why they do it</p>
                                  <Bullets items={psychs} tone="text-violet-400" />
                                </div>
                              )}
                              {behs.length > 0 && (
                                <div className="mt-4">
                                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">What people do</p>
                                  <Bullets items={behs} tone="text-amber-500" />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        {other.length > 0 && (
                          <div className="mt-4 flex flex-wrap gap-1.5">
                            {other.map((e, k) => (
                              <span key={k} className="rounded-lg bg-slate-100 px-2.5 py-1 text-[13px] text-slate-700">
                                {e.name} <CiteLink cite={e.cite} refNo={refFor(e.cite)} />
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Key stats — dense two-column cards */}
              <Reveal>
              <div id="sec-stats" className="scroll-mt-24">
                <SectionTitle no="05" eyebrow="The evidence">Key statistics</SectionTitle>
                <div className="mt-4 grid grid-cols-1 gap-2.5 md:grid-cols-2">
                  {dossier.key_stats?.map((s, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-xl border border-slate-200 border-l-4 border-l-emerald-400 bg-white px-4 py-3 shadow-sm">
                      <p className="text-[14px] leading-relaxed text-slate-700">
                        {s.stat} <CiteLink cite={s.cite} refNo={refFor(s.cite)} />
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              </Reveal>

              {/* Tyson layer */}
              <Reveal>
              <div id="sec-tyson" className="scroll-mt-24">
                <SectionTitle no="06" eyebrow="From trend to action">The Tyson layer</SectionTitle>

                {/* Row 1: Questions + Existing portfolio */}
                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {/* How might Tyson? */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-amber-600">How might Tyson…?</p>
                    <ul className="mt-3 space-y-2">
                      {dossier.tyson_questions?.map((q, i) => {
                        const text = typeof q === "string" ? q : q.question;
                        const cite = typeof q === "string" ? undefined : (q.cite ?? undefined);
                        const refNo = refFor(cite);
                        return (
                          <li key={i} className="flex gap-2 text-[14px] leading-relaxed text-slate-800">
                            <span className="shrink-0 font-extrabold text-amber-500">?</span>
                            <span>{text} <CiteLink cite={cite} refNo={refNo} /></span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  {/* Already in Tyson's portfolio */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-emerald-600">Already in Tyson&apos;s portfolio</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">Products already riding this trend</p>
                    {dossier.tyson_portfolio?.length ? (
                      <div className="mt-3 space-y-1">
                        {(() => {
                          const grouped: Record<string, string[]> = {};
                          dossier.tyson_portfolio.forEach(p => {
                            if (!grouped[p.brand]) grouped[p.brand] = [];
                            grouped[p.brand].push(p.name);
                          });
                          return Object.entries(grouped).map(([brand, products]) => (
                            <div key={brand} className="py-1.5 border-b border-slate-100 last:border-0">
                              <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-emerald-700">{brand}</p>
                              <ul className="mt-1 space-y-0.5">
                                {products.map((name, j) => (
                                  <li key={j} className="text-[13px] leading-relaxed text-slate-700">— {name}</li>
                                ))}
                              </ul>
                            </div>
                          ));
                        })()}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-slate-400">No existing products mapped yet.</p>
                    )}
                  </div>
                </div>

                {/* Row 2: White space + new concepts — full-width card grid */}
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-indigo-600">White space &amp; new concepts</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">Market gaps and net-new Tyson concept ideas — territory nobody has claimed yet</p>
                  {(() => {
                    const wsItems = (dossier.whitespace ?? []).map(w => ({ _kind: "gap" as const, ...w }));
                    const conceptItems = (dossier.tyson_ideas ?? [])
                      .filter(it => it.tier !== "Core")
                      .map(it => ({ _kind: "concept" as const, ...it }));
                    const combined = [...wsItems, ...conceptItems];
                    if (!combined.length) return <p className="mt-3 text-sm text-slate-400">No white space mapped yet.</p>;
                    return (
                      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {combined.map((item, i) => {
                          if (item._kind === "gap") {
                            const w = item as typeof wsItems[0];
                            return (
                              <div key={i} className="flex flex-col gap-2 rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                                <div className="flex items-start justify-between gap-2">
                                  <span className="text-[14px] font-bold leading-snug text-slate-900">{w.name}</span>
                                  <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">Market gap</span>
                                </div>
                                {w.note && <p className="text-[13px] leading-relaxed text-slate-600">{w.note}</p>}
                                {w.cite && (
                                  <div className="mt-auto pt-1">
                                    <CiteLink cite={w.cite} refNo={refFor(w.cite)} />
                                  </div>
                                )}
                              </div>
                            );
                          } else {
                            const it = item as typeof conceptItems[0];
                            const tierStyle = it.tier ? TIER_STYLE[it.tier] : null;
                            const valColor = it.validation === "Strong" ? "bg-emerald-100 text-emerald-700"
                              : it.validation === "Moderate" ? "bg-amber-100 text-amber-700"
                              : "bg-slate-100 text-slate-500";
                            return (
                              <div key={i} className="flex flex-col gap-2 rounded-xl border border-violet-100 bg-violet-50 p-4">
                                <div className="flex items-start justify-between gap-2">
                                  <span className="text-[14px] font-bold leading-snug text-slate-900">{it.name}</span>
                                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                                    {tierStyle && (
                                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tierStyle.badge}`}>
                                        {tierStyle.icon} {it.tier}
                                      </span>
                                    )}
                                    {it.validation && (
                                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${valColor}`}>
                                        {it.validation}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {it.brand && <span className="text-[11px] font-semibold text-slate-500">{it.brand}</span>}
                                {it.note && <p className="text-[13px] leading-relaxed text-slate-600">{it.note}</p>}
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {it.format && <span className="rounded bg-white border border-violet-200 px-1.5 py-0.5 text-[11px] text-slate-600">{it.format}</span>}
                                  {it.occasion && <span className="rounded bg-white border border-violet-200 px-1.5 py-0.5 text-[11px] text-slate-600">{it.occasion}</span>}
                                </div>
                                {it.subtrend && <p className="text-[11px] italic text-violet-600">↑ rides: {it.subtrend}</p>}
                                {it.cites && it.cites.length > 0 && (
                                  <div className="mt-auto flex flex-wrap gap-1 pt-1">
                                    {it.cites.map((c, ci) => <CiteLink key={ci} cite={c} />)}
                                  </div>
                                )}
                              </div>
                            );
                          }
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>
              </Reveal>

              {/* Bibliography */}
              <Reveal>
              <div id="sec-sources" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
                {refList.length > 0 && (
                  <div className="mb-7">
                    <SectionTitle no="07" eyebrow="Check everything">References</SectionTitle>
                    <p className="mt-1 text-xs text-slate-400">
                      Every numbered claim above resolves here. Click to open the exact source (📄 documents open at the cited page).
                    </p>
                    <ol className="mt-3 grid grid-cols-1 gap-x-8 gap-y-1.5 lg:grid-cols-2">
                      {refList.map(({ n, cite }) => {
                        const href = citeHref(cite);
                        return (
                          <li key={n} className="flex gap-2 text-[13px] leading-relaxed">
                            <span className="w-8 shrink-0 text-right font-extrabold text-sky-600">[{n}]</span>
                            {href ? (
                              <a href={href} target="_blank" rel="noreferrer" className="min-w-0 text-slate-700 hover:text-sky-700 hover:underline">
                                {cite.kind === "web" ? "↗ " : "📄 "}{cite.label || (cite.kind === "web" ? cite.url : "source document")}
                                {cite.page ? <span className="text-slate-400"> · p.{cite.page}</span> : null}
                              </a>
                            ) : (
                              <span className="text-slate-600">{cite.label}</span>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}
                <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-slate-500">Documents used</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {dossier.sources?.map((s, i) => (
                    s.report_id ? (
                      <span key={i} className="inline-flex items-center gap-1">
                        <a href={`/api/file/${s.report_id}`} target="_blank" rel="noreferrer"
                           className={`rounded-lg px-2.5 py-1.5 text-[13px] font-semibold hover:opacity-75 ${TAG_STYLE[s.source_tag ?? ""] ?? "bg-slate-100 text-slate-600"}`}
                           title="Open the original document">
                          📄 {s.label}
                        </a>
                        <Link href={`/report/${s.report_id}`}
                              className="rounded-md bg-slate-50 px-1.5 py-1.5 text-[11px] font-medium text-slate-400 hover:text-slate-600"
                              title="Open the extracted view in TrendLens">
                          tree
                        </Link>
                      </span>
                    ) : (
                      <span key={i} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[13px] text-slate-600">{s.label}</span>
                    )
                  ))}
                </div>
                <p className="mt-3 text-xs text-slate-400">
                  📄 opens the ORIGINAL document (PDF/PPTX) · &quot;tree&quot; opens its extracted view in TrendLens · ↗ links open the original website.
                </p>
              </div>
              </Reveal>
            </div>
        </div>
      )}
      </div>{/* ml-[220px] content wrapper */}
    </div>
  );
}
