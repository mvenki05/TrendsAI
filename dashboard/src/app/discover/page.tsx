"use client";
import { apiUrl, HOSTED } from "@/lib/api";

import { useCallback, useEffect, useState } from "react";
import { DiscoveredNode, DiscoverySource } from "@/lib/types";
import { levelLabel } from "@/lib/levels";
import { PERIODS, windowStats } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";

// ── Shared helpers ──────────────────────────────────────────────────────────

function parseJSON<T>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a : []; } catch { return []; }
}

function Sparkline({ series, rising, w = 90, h = 26 }: { series: number[]; rising: boolean; w?: number; h?: number }) {
  if (series.length < 2) return null;
  const max = Math.max(...series), min = Math.min(...series), rng = max - min || 1;
  const pts = series.map((v, i) => `${(i / (series.length - 1)) * w},${h - ((v - min) / rng) * (h - 4) - 2}`).join(" ");
  const color = rising ? "#059669" : "#94a3b8";
  return (
    <svg width={w} height={h} className="shrink-0" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

type Tab = "all" | "market" | "whitespace" | "map";

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "market", label: "New in Market" },
  { key: "whitespace", label: "White Space" },
  { key: "map", label: "Trend Map" },
];

// ── Section: New in Market (web harvest + US retail radar) ──────────────────

const LEVELS: { key: DiscoveredNode["level"]; label: string; dot: string; chart: boolean }[] = [
  { key: "subtrend", label: "Subtrends", dot: "bg-indigo-500", chart: false },
  { key: "product", label: "What to make", dot: "bg-sky-500", chart: false },
  { key: "ingredient", label: "What's in it", dot: "bg-emerald-500", chart: true },
  { key: "behaviour", label: "What people do", dot: "bg-fuchsia-500", chart: false },
  { key: "psychographic", label: "Why they do it", dot: "bg-amber-500", chart: false },
];

const MEGA_ORDER = [
  "Ubiquity of Protein & GLP-1 Nutrition",
  "Food Fusion & Global Flavors",
  "Easy Eats",
  "Bifurcated Budgets",
  "Brand Scrutiny & Clean Label",
  "Alcohol Flavors",
  "Data-Enabled Food Choices",
  "Functional Drinks",
];
const UNIVERSE_ORDER: { key: string; icon: string }[] = [
  { key: "Protein", icon: "🥩" },
  { key: "Snacking", icon: "🥨" },
  { key: "Lunch", icon: "🥪" },
  { key: "Breakfast", icon: "🍳" },
  { key: "Dinner", icon: "🍽️" },
];

function GrowthBadge({ st, validated }: { st: ReturnType<typeof windowStats>; validated: boolean }) {
  if (!validated) return <span className="text-[10px] text-slate-400">not validated</span>;
  if (!st.hasData) return <span className="text-[10px] text-slate-400">no Trends data</span>;
  const up = st.rising;
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${up ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
      {up ? "▲ " : ""}{st.yoy != null ? `${st.yoy > 0 ? "+" : ""}${Math.round(st.yoy)}%` : `${st.current ?? "—"}`}
    </span>
  );
}

function InnovationCard({ n }: { n: DiscoveredNode }) {
  const sources = parseJSON<DiscoverySource>(n.sources);
  return (
    <div className="flex flex-col rounded-xl border border-violet-100 bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-slate-900">{n.name}</div>
          {n.subtrend && <div className="mt-0.5 text-[11px] text-slate-400">↳ {n.subtrend}</div>}
        </div>
        <span className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700">Novel</span>
      </div>
      {n.description && <p className="mt-2 flex-1 text-[11px] leading-relaxed text-slate-600">{n.description}</p>}
      {n.relation && <p className="mt-1.5 text-[11px] leading-relaxed text-indigo-700">↳ {n.relation}</p>}
      {sources.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2">
          {sources.map((s, i) => (
            s.url
              ? <a key={i} href={s.url} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-violet-100 hover:text-violet-700">
                  <span>↗</span>{s.source || s.title || "Source"}
                </a>
              : <span key={i} className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                  {s.source || s.title || "Source"}
                </span>
          ))}
        </div>
      )}
    </div>
  );
}

function UsProductCard({ n }: { n: DiscoveredNode }) {
  const sources = parseJSON<DiscoverySource>(n.sources);
  return (
    <div className="flex flex-col rounded-xl border border-rose-100 bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 font-semibold text-slate-900">{n.name}</div>
        <span className="shrink-0 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700">New in US</span>
      </div>
      {n.mapped_megatrend && (
        <div className="mt-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 ring-1 ring-violet-200">
            ◈ {n.mapped_megatrend}
          </span>
        </div>
      )}
      {n.description && <p className="mt-2 flex-1 text-[11px] leading-relaxed text-slate-600">{n.description}</p>}
      {n.relation && (
        <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-800">
          <span className="font-bold uppercase tracking-wide text-amber-600">Tyson gap: </span>{n.relation}
        </p>
      )}
      {sources.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2">
          {sources.map((s, i) => (
            s.url
              ? <a key={i} href={s.url} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-rose-100 hover:text-rose-700">
                  <span>↗</span>{s.source || s.title || "Source"}
                </a>
              : <span key={i} className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                  {s.source || s.title || "Source"}
                </span>
          ))}
        </div>
      )}
    </div>
  );
}

function RisingCard({ n, weeks }: { n: DiscoveredNode; weeks: number }) {
  const series = parseJSON<number>(n.interest_series).slice(-weeks);
  const st = windowStats(series);
  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold text-slate-900">{n.name}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">{n.megatrend} · {levelLabel(n.level)}</div>
          {n.description && <div className="mt-1 text-[11px] leading-relaxed text-slate-600">{n.description}</div>}
          {n.relation && <div className="mt-0.5 text-[11px] leading-relaxed text-indigo-700">↳ {n.relation}</div>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {n.is_durable && <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white" title="Rising, still accelerating, low volatility — a durable bet">DURABLE ▲</span>}
          {!n.in_deck && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">NEW</span>}
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between">
        <Sparkline series={series} rising={st.rising} w={150} h={44} />
        <span className={`text-lg font-bold tabular-nums ${st.rising ? "text-emerald-600" : "text-slate-500"}`}>
          {st.yoy != null ? `${st.rising ? "▲ " : ""}${st.yoy > 0 ? "+" : ""}${Math.round(st.yoy)}%` : "—"}
        </span>
      </div>
    </div>
  );
}

function MarketItem({ n, withChart, weeks }: { n: DiscoveredNode; withChart: boolean; weeks: number }) {
  const [open, setOpen] = useState(false);
  const sources = parseJSON<DiscoverySource>(n.sources);
  const series = parseJSON<number>(n.interest_series).slice(-weeks);
  const st = windowStats(series);
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="w-7 shrink-0 text-right text-[10px] font-mono text-slate-400" title={`${n.support} independent sources`}>{n.support}×</span>
        <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{n.name}</span>
        {!n.in_deck && <span className="shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">NEW</span>}
        {withChart && <Sparkline series={series} rising={st.rising} />}
        {withChart && <GrowthBadge st={st} validated={n.has_data != null} />}
        {withChart && n.classification && n.classification.startsWith("low-base") && (
          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500" title="Growth % is off a near-zero baseline — unreliable">low base</span>
        )}
        {withChart && n.is_durable && (
          <span className="shrink-0 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">durable</span>
        )}
        {sources.length > 0 && (
          <button onClick={() => setOpen(!open)} className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-300">
            {open ? "hide sources" : `${sources.length} source${sources.length === 1 ? "" : "s"}`}
          </button>
        )}
      </div>
      {(n.description || n.relation) && (
        <div className="mt-1.5 space-y-1 pl-9">
          {n.description && <div className="text-[11px] leading-relaxed text-slate-600">{n.description}</div>}
          {n.relation && (
            <div className="text-[11px] leading-relaxed text-indigo-700" title="How this relates to the megatrend">
              ↳ {n.relation}
            </div>
          )}
        </div>
      )}
      {open && (
        <div className="mt-2 space-y-1 border-t border-slate-200 pl-9 pt-2">
          {sources.map((s, i) => (
            <div key={i} className="text-xs">
              {s.source && <span className="font-semibold text-slate-700">{s.source}</span>}
              {s.source && <span className="text-slate-400"> · </span>}
              {s.url
                ? <a href={s.url} target="_blank" rel="noreferrer" className="text-sky-700 underline decoration-sky-300 hover:decoration-sky-600">{s.title}</a>
                : <span className="text-slate-600">{s.title}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MarketSection({ nodes, periodWeeks }: { nodes: DiscoveredNode[]; periodWeeks: number }) {
  const [openMega, setOpenMega] = useState<Set<string>>(new Set());
  const [defaultedOpen, setDefaultedOpen] = useState(false);

  function toggle(m: string) {
    setOpenMega((prev) => { const s = new Set(prev); s.has(m) ? s.delete(m) : s.add(m); return s; });
  }

  const usProducts = nodes.filter((n) => n.level === "us_product");
  const megaNodes = nodes.filter((n) => n.level !== "us_product");

  const byUniverse = new Map<string, DiscoveredNode[]>();
  for (const n of usProducts) {
    if (!byUniverse.has(n.megatrend)) byUniverse.set(n.megatrend, []);
    byUniverse.get(n.megatrend)!.push(n);
  }
  const byMega = new Map<string, DiscoveredNode[]>();
  for (const n of megaNodes) {
    if (!byMega.has(n.megatrend)) byMega.set(n.megatrend, []);
    byMega.get(n.megatrend)!.push(n);
  }
  const order = [
    ...MEGA_ORDER.filter((m) => byMega.has(m)),
    ...[...byMega.keys()].filter((m) => !MEGA_ORDER.includes(m)),
  ];

  if (!defaultedOpen && (order.length > 0 || byUniverse.size > 0)) {
    setOpenMega(new Set(byUniverse.size > 0 ? ["Protein"] : [order[0]]));
    setDefaultedOpen(true);
  }

  if (nodes.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-16 text-center shadow-[0_4px_24px_rgba(0,0,0,0.07)]">
        <p className="text-slate-400">Nothing discovered yet. Hit &quot;Discover from web&quot; to start. (Needs synthesized megatrends first.)</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {byUniverse.size > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.07)]">
          <div className="mb-1 flex items-baseline gap-2">
            <h2 className="font-display text-xl font-semibold text-slate-900">US Market Radar</h2>
            <span className="text-xs text-slate-400">Real products new in US retail (2024–2026), mapped against what Tyson makes</span>
          </div>
          <div className="mt-4 space-y-2">
            {UNIVERSE_ORDER.filter((u) => byUniverse.has(u.key)).map(({ key, icon }) => {
              const items = byUniverse.get(key)!;
              const open = openMega.has(key);
              return (
                <div key={key} className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50 transition-shadow hover:shadow-sm">
                  <button onClick={() => toggle(key)}
                    className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-rose-50/40">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={`text-xs text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
                      <span className="text-base">{icon}</span>
                      <span className="truncate font-semibold text-slate-900">{key}</span>
                    </span>
                    <span className="shrink-0 text-xs text-slate-500">
                      {items.length} products · <span className="font-semibold text-amber-600">{items.length} Tyson gaps</span>
                    </span>
                  </button>
                  {open && (
                    <div className="border-t border-slate-100 px-5 py-4">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {items.map((n) => <UsProductCard key={n.discovery_id} n={n} />)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.07)]">
        <div className="mb-1 flex items-baseline gap-2">
          <h2 className="font-display text-xl font-semibold text-slate-900">Megatrend Discoveries</h2>
          <span className="text-xs text-slate-400">Open a megatrend to see its rising finds and full detail.</span>
        </div>
        <div className="mt-4 space-y-2">
          {order.map((mega) => {
            const items = byMega.get(mega)!;
            const open = openMega.has(mega);
            const mNew = items.filter((i) => !i.in_deck).length;
            const megaRising = items.filter((i) => i.is_rising)
              .sort((a, b) => Number(!!b.is_durable) - Number(!!a.is_durable) || (b.yoy_growth ?? 0) - (a.yoy_growth ?? 0));
            const desc = items.find((i) => i.mega_description)?.mega_description;
            return (
              <div key={mega} className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50 transition-shadow hover:shadow-sm">
                <button onClick={() => toggle(mega)}
                  className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-slate-100/60">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={`text-xs text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
                    <span className="truncate font-semibold text-slate-900">{mega}</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {items.length} found · <span className="text-sky-600">{mNew} new</span>
                    {megaRising.length > 0 && <> · <span className="text-emerald-600">{megaRising.length}↑ rising</span></>}
                  </span>
                </button>
                {open && (
                  <div className="border-t border-slate-100 bg-white px-5 py-4">
                    {desc && <p className="mb-4 text-sm leading-relaxed text-slate-600">{desc}</p>}

                    {megaRising.length > 0 && (
                      <div className="mb-5">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-600">🔥 Rising on Google Trends ({megaRising.length})</div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                          {megaRising.map((n) => <RisingCard key={n.discovery_id} n={n} weeks={periodWeeks} />)}
                        </div>
                      </div>
                    )}

                    {(() => {
                      const innovations = items.filter((i) => i.level === "innovation");
                      if (innovations.length === 0) return null;
                      return (
                        <div className="mb-5">
                          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-600">💡 Global Innovations ({innovations.length})</div>
                          <p className="mb-3 text-[11px] text-slate-500">Novel product concepts from around the world: unexpected formats, delivery mechanisms, and category-crossing ideas.</p>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {innovations.map((n) => <InnovationCard key={n.discovery_id} n={n} />)}
                          </div>
                        </div>
                      );
                    })()}

                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">All discoveries</div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {LEVELS.map(({ key, label, dot, chart }) => {
                        const rows = items.filter((i) => i.level === key)
                          .sort((a, b) => Number(!!b.is_rising) - Number(!!a.is_rising) || (b.support ?? 0) - (a.support ?? 0));
                        if (rows.length === 0) return null;
                        return (
                          <div key={key}>
                            <div className="mb-1.5 flex items-center gap-1.5">
                              <span className={`h-2 w-2 rounded-full ${dot}`} />
                              <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</span>
                              <span className="text-xs text-slate-400">({rows.length})</span>
                            </div>
                            <div className="space-y-1">{rows.map((n) => <MarketItem key={n.discovery_id} n={n} withChart={chart} weeks={periodWeeks} />)}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-slate-400">
        <span className="rounded bg-sky-100 px-1 py-0.5 font-semibold text-sky-700">NEW</span> = not in any uploaded deck · <span className="text-emerald-600">▲</span> = rising on Google Trends · sparkline = last 12 months of search interest
      </p>
    </div>
  );
}

// ── Section: White Space Scout (novelty-gated, brand-blind by design) ───────

interface WhiteSpaceIdea {
  idea_id: string;
  run_id: string;
  name: string;
  description: string | null;
  origin: string | null;
  wow: string | null;
  novelty_score: number | null;
  search_term: string | null;
  support: number | null;
  sources: string | null;
  closest_known: string | null;
  novelty_reason: string | null;
  buildable: boolean | null;
  category: string | null;
  tyson_brand: string | null;
  concept_name: string | null;
  pitch: string | null;
  fit_score: number | null;
  fit_rationale: string | null;
  status: string | null;
  current_interest: number | null;
  yoy_growth: number | null;
  is_rising: boolean | null;
  has_data: boolean | null;
  interest_series: string | null;
  classification: string | null;
  is_durable: boolean | null;
  created_at: string | null;
}

interface Subtrend {
  subtrend_id: string;
  name: string;
  description: string | null;
  idea_names: string | null;
  member_count: number | null;
  run_count: number | null;
  rising_count: number | null;
  maps_to_megatrend: string | null;
  created_at: string | null;
}

interface ScoutSrc { title?: string; url?: string | null; source?: string }

function siteName(s: ScoutSrc): string {
  if (s.url) {
    try { return new URL(s.url).hostname.replace(/^www\./, ""); } catch { /* fall through */ }
  }
  return s.source || s.title || "Source";
}

const CLS_STYLE: Record<string, string> = {
  "durable": "bg-emerald-600 text-white",
  "rising-accelerating": "bg-emerald-100 text-emerald-700",
  "rising-maturing": "bg-emerald-50 text-emerald-600",
  "volatile-fad": "bg-amber-100 text-amber-700",
  "declining": "bg-rose-50 text-rose-600",
  "flat": "bg-slate-100 text-slate-500",
  "low-base": "bg-slate-100 text-slate-500",
  "no-data": "bg-slate-100 text-slate-400",
};

function DemandRow({ idea }: { idea: WhiteSpaceIdea }) {
  if (idea.has_data == null) return null;
  const series = parseJSON<number>(idea.interest_series);
  return (
    <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">US search demand</span>
        {idea.classification && (
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${CLS_STYLE[idea.classification] ?? "bg-slate-100 text-slate-500"}`}
                title="Trend-math verdict on 12 months of Google Trends data">
            {idea.classification}
          </span>
        )}
        {idea.yoy_growth != null && idea.has_data && (
          <span className={`text-[11px] font-bold tabular-nums ${idea.is_rising ? "text-emerald-600" : "text-slate-500"}`}>
            {idea.yoy_growth > 0 ? "+" : ""}{Math.round(idea.yoy_growth)}% YoY
          </span>
        )}
      </div>
      {idea.has_data && <Sparkline series={series.slice(-52)} rising={!!idea.is_rising} w={110} h={30} />}
    </div>
  );
}

function SubtrendCard({ s }: { s: Subtrend }) {
  const members = parseJSON<string>(s.idea_names);
  return (
    <div className="flex flex-col rounded-xl border border-indigo-100 bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold leading-snug text-slate-900">{s.name}</div>
        {s.maps_to_megatrend ? (
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600"
                title="An existing megatrend already frames this direction">
            ↳ {s.maps_to_megatrend}
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white"
                title="No uploaded megatrend covers this — the decks are blind to it">
            NEW TERRITORY
          </span>
        )}
      </div>
      {s.description && <p className="mt-1.5 text-[12px] leading-relaxed text-slate-600">{s.description}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
        <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-semibold text-indigo-700">{s.member_count} finds</span>
        {(s.run_count ?? 0) > 1 && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600"
                title="Seen across multiple scout runs — persistence, not a blip">{s.run_count} runs</span>
        )}
        {(s.rising_count ?? 0) > 0 && (
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-700">
            ↑ {s.rising_count} rising on Trends
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {members.map((m) => (
          <span key={m} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{m}</span>
        ))}
      </div>
    </div>
  );
}

function noveltyTone(score: number | null): string {
  if (score == null) return "bg-slate-100 text-slate-600";
  if (score >= 80) return "bg-violet-600 text-white";
  if (score >= 65) return "bg-violet-100 text-violet-700";
  return "bg-slate-100 text-slate-600";
}

// Deliberately never renders idea.tyson_brand — White Space stays brand-blind so the
// idea itself, not the Tyson angle, is what a reader evaluates first (user preference).
function ScoutIdeaCard({ idea }: { idea: WhiteSpaceIdea }) {
  const sources = parseJSON<ScoutSrc>(idea.sources);
  return (
    <div className="flex flex-col rounded-xl border border-slate-100 bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition-shadow hover:shadow-[0_4px_20px_rgba(0,0,0,0.10)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-base font-semibold leading-snug text-slate-900">{idea.name}</div>
        <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-bold tabular-nums ${noveltyTone(idea.novelty_score)}`}
              title="Novelty: how far this is from anything in mainstream US retail (0-100)">
          ✦ {idea.novelty_score != null ? Math.round(idea.novelty_score) : "—"}
        </span>
      </div>

      {idea.wow && (
        <p className="mt-2 text-sm font-medium leading-relaxed text-violet-800">{idea.wow}</p>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
        {idea.origin && <span className="rounded bg-sky-50 px-2 py-0.5 font-medium text-sky-700" title="Where the scout saw it">📍 {idea.origin}</span>}
        {(idea.support ?? 0) > 1 && (
          <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-600">{idea.support} publishers</span>
        )}
        {idea.closest_known && (
          <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-500"
                title={`Why it's still new: ${idea.novelty_reason ?? ""}`}>
            nearest we track: {idea.closest_known.replace(/\s*\([^)]*\)\s*$/, "")}
          </span>
        )}
      </div>

      {idea.description && (
        <p className="mt-2 flex-1 text-[12px] leading-relaxed text-slate-600">{idea.description}</p>
      )}

      {idea.buildable && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[12px] leading-relaxed">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Tyson angle</span>
            {idea.category && (
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700" title="Real Tyson catalog category this lands in">
                lands in: {idea.category}
              </span>
            )}
            {idea.fit_score != null && (
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700" title="Buildability fit (0-100)">
                fit {Math.round(idea.fit_score)}
              </span>
            )}
          </div>
          <div className="mt-1 text-slate-700">
            {idea.concept_name && <span className="font-semibold">{idea.concept_name}: </span>}
            {idea.pitch || idea.fit_rationale}
          </div>
        </div>
      )}

      <DemandRow idea={idea} />

      {sources.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2">
          {sources.map((s, i) =>
            s.url ? (
              <a key={i} href={s.url} target="_blank" rel="noreferrer"
                 className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-sky-100 hover:text-sky-700">
                <span>↗</span>{siteName(s)}
              </a>
            ) : (
              <span key={i} className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                <span>↗</span>{siteName(s)}
              </span>
            )
          )}
        </div>
      )}
    </div>
  );
}

function WhiteSpaceSection({ ideas, subtrends }: { ideas: WhiteSpaceIdea[]; subtrends: Subtrend[] }) {
  const [tysonOnly, setTysonOnly] = useState(false);
  const shown = tysonOnly ? ideas.filter((i) => i.buildable) : ideas;
  const runDate = ideas[0]?.created_at ? new Date(ideas[0].created_at).toLocaleString() : null;

  if (ideas.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-16 text-center shadow-[0_4px_24px_rgba(0,0,0,0.07)]">
        <p className="text-slate-400">No scout runs yet. Hit <span className="font-semibold text-slate-600">Run Scout</span> to hunt the internet for ideas nothing in the system covers.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={tysonOnly} onChange={(e) => setTysonOnly(e.target.checked)}
                 className="h-4 w-4 rounded border-slate-300 accent-emerald-600" />
          Tyson-buildable only
        </label>
        {runDate && <p className="text-xs text-slate-400">Last run: {runDate}</p>}
      </div>

      {subtrends.length > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.07)]">
          <div className="mb-1 flex items-baseline gap-2">
            <h2 className="font-display text-xl font-semibold text-slate-900">Emerging Subtrends</h2>
            <span className="text-xs text-slate-400">clustered bottom-up · <span className="font-semibold text-indigo-600">NEW TERRITORY</span> = no uploaded megatrend covers it</span>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {subtrends.map((s) => <SubtrendCard key={s.subtrend_id} s={s} />)}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.07)]">
        <div className="mb-1 flex items-baseline gap-2">
          <h2 className="font-display text-xl font-semibold text-slate-900">This run&apos;s finds</h2>
          <span className="text-xs text-slate-400">ranked by Tyson fit · demand bar fills in after validation</span>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((i) => <ScoutIdeaCard key={i.idea_id} idea={i} />)}
        </div>
      </div>

      <p className="text-xs text-slate-400">
        ✦ = novelty score (distance from mainstream US retail) · ranked by Tyson fit, then novelty · these come from internet white space and are guaranteed new to the system.
      </p>
    </div>
  );
}

// ── Section: Trend Map (bottom-up megatrend taxonomy rebuild + deck-agreement check) ─

interface MapNode {
  node_id: string;
  parent_id: string | null;
  level: string;
  name: string;
  description: string | null;
  geo: string | null;
  search_term: string | null;
  support: number | null;
  sources: string | null;
  megatrend_name: string | null;
  subtrend_name: string | null;
  overlap_deck: string | null;
  evidence_origin: string | null;
  created_at: string | null;
}

interface MapSrc { title?: string; url?: string | null; source?: string }

const MAP_ACCENT_DOT = [
  "bg-emerald-500", "bg-orange-500", "bg-sky-500", "bg-amber-500",
  "bg-teal-500", "bg-purple-500", "bg-indigo-500", "bg-cyan-500",
];

const MAP_LEVEL_STYLE: Record<string, string> = {
  product:       "bg-sky-100 text-sky-700",
  ingredient:    "bg-emerald-100 text-emerald-700",
  behaviour:     "bg-amber-100 text-amber-700",
  psychographic: "bg-violet-100 text-violet-700",
};

function MapGeoBadge({ geo }: { geo: string | null }) {
  if (!geo) return null;
  const us = geo.toUpperCase() === "US";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${us ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-600"}`}>
      {us ? "🇺🇸 US" : `🌍 ${geo}`}
    </span>
  );
}

function MapEntityChip({ n }: { n: MapNode }) {
  const src = parseJSON<MapSrc>(n.sources)[0];
  return (
    <div className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${MAP_LEVEL_STYLE[n.level] ?? "bg-slate-100 text-slate-600"}`}>
        {levelLabel(n.level)}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold text-slate-800">{n.name}</span>
          {n.geo && n.geo.toUpperCase() !== "US" && (
            <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{n.geo}</span>
          )}
          {(n.support ?? 0) > 1 && (
            <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
              {n.support} publishers
            </span>
          )}
          {n.evidence_origin === "scout" && (
            <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700"
                  title="Found by the White Space Scout">🔭 scout</span>
          )}
        </div>
        {n.description && (
          <div className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{n.description}</div>
        )}
        {src?.url && (
          <a href={src.url} target="_blank" rel="noreferrer"
             className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-slate-400 hover:text-sky-600">
            ↗ {src.source ?? "Source"}
          </a>
        )}
      </div>
    </div>
  );
}

function TrendMapSection({ nodes }: { nodes: MapNode[] }) {
  const megatrends = nodes.filter((n) => n.level === "megatrend");
  const unassigned = nodes.filter((n) => n.level !== "megatrend" && n.level !== "subtrend" && !n.megatrend_name);
  const builtDate = megatrends[0]?.created_at ? new Date(megatrends[0].created_at).toLocaleString() : null;

  if (megatrends.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-16 text-center shadow-[0_4px_24px_rgba(0,0,0,0.07)]">
        <p className="text-slate-500">No map yet.</p>
        <p className="mt-1 text-sm text-slate-400">
          Hit <span className="font-semibold text-slate-600">Build Map</span> to author the first bottom-up megatrend report from the internet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {builtDate && <p className="text-xs text-slate-400">Last build: {builtDate}</p>}
      {megatrends.map((m, i) => {
        const subs = nodes.filter((n) => n.level === "subtrend" && n.megatrend_name === m.name);
        return (
          <div key={m.node_id} className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-[0_4px_24px_rgba(0,0,0,0.07)]">
            <div className="px-6 pt-5 pb-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`h-3 w-3 shrink-0 rounded-full ${MAP_ACCENT_DOT[i % MAP_ACCENT_DOT.length]}`} />
                  <h2 className="text-lg font-bold leading-snug text-slate-900">{m.name}</h2>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <MapGeoBadge geo={m.geo} />
                  {m.overlap_deck ? (
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600"
                          title={`The uploaded decks call this "${m.overlap_deck}"`}>
                      ✓ decks agree
                    </span>
                  ) : (
                    <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-700">
                      NEW: not in decks
                    </span>
                  )}
                </div>
              </div>
              {m.description && (
                <p className="mt-2 ml-6 max-w-3xl text-sm leading-relaxed text-slate-500">{m.description}</p>
              )}
            </div>
            <div className="space-y-4 border-t border-slate-100 px-6 py-5">
              {subs.map((s) => {
                const kids = nodes.filter((n) => n.parent_id === s.node_id);
                return (
                  <div key={s.node_id}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-700">{s.name}</span>
                      <MapGeoBadge geo={s.geo} />
                    </div>
                    {s.description && <div className="mt-0.5 text-[11px] text-slate-400">{s.description}</div>}
                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {kids.map((n) => <MapEntityChip key={n.node_id} n={n} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {unassigned.length > 0 && (
        <details className="rounded-2xl border border-slate-100 bg-white px-6 py-4 shadow-[0_4px_24px_rgba(0,0,0,0.07)]">
          <summary className="cursor-pointer text-sm font-semibold text-slate-500">
            {unassigned.length} corroborated signals not (yet) part of any megatrend
          </summary>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {unassigned.map((n) => <MapEntityChip key={n.node_id} n={n} />)}
          </div>
        </details>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function DiscoverPage() {
  const [tab, setTab] = useState<Tab>("all");
  const [loading, setLoading] = useState(true);

  const [nodes, setNodes] = useState<DiscoveredNode[]>([]);
  const [scoutIdeas, setScoutIdeas] = useState<WhiteSpaceIdea[]>([]);
  const [subtrends, setSubtrends] = useState<Subtrend[]>([]);
  const [periodWeeks, setPeriodWeeks] = useState(52);

  const [mapNodes, setMapNodes] = useState<MapNode[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [scouting, setScouting] = useState(false);
  const [building, setBuilding] = useState(false);
  const [runResult, setRunResult] = useState<{ ok: boolean; message: string } | null>(null);

  const load = useCallback(async () => {
    const [marketRes, labRes, mapRes] = await Promise.all([
      fetch(apiUrl("/discover")).then((r) => r.json()).catch(() => []),
      fetch(apiUrl("/lab")).then((r) => r.json()).catch(() => ({})),
      fetch(apiUrl("/map")).then((r) => r.json()).catch(() => ({})),
    ]);
    if (Array.isArray(marketRes)) setNodes(marketRes);
    if (Array.isArray(labRes.ideas)) setScoutIdeas(labRes.ideas);
    if (Array.isArray(labRes.subtrends)) setSubtrends(labRes.subtrends);
    if (Array.isArray(mapRes.nodes)) setMapNodes(mapRes.nodes);
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  // "Discover from web" is a polling trigger (fires, then re-fetches every 8s for up
  // to 20 min) since discover_web.py's own run duration varies with harvest size.
  useEffect(() => {
    if (!discovering) return;
    const iv = setInterval(load, 8000);
    const stop = setTimeout(() => setDiscovering(false), 1200000);
    return () => { clearInterval(iv); clearTimeout(stop); };
  }, [discovering, load]);

  async function triggerDiscover() {
    setDiscovering(true);
    try { await fetch(apiUrl("/discover/run"), { method: "POST" }); } catch { /* ignore */ }
  }

  // Waits for the real run result (10-20 min) instead of firing detached.
  async function runScout() {
    setScouting(true);
    setRunResult(null);
    try {
      const res = await fetch(apiUrl("/lab/run"), { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.status === "ok") {
        setRunResult({ ok: true, message: "Scout run complete." });
        load();
      } else {
        setRunResult({ ok: false, message: data.error || `Scout run failed (${res.status}).` });
      }
    } catch (err) {
      setRunResult({ ok: false, message: err instanceof Error ? err.message : "Scout run request failed." });
    } finally {
      setScouting(false);
    }
  }

  // Waits for the real build result (a couple minutes: real web harvest + LLM steps)
  // instead of firing detached and losing track of what happened.
  async function buildMap() {
    setBuilding(true);
    setRunResult(null);
    try {
      const res = await fetch(apiUrl("/map/run"), { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.status === "ok") {
        setRunResult({ ok: true, message: "Map build complete." });
        load();
      } else {
        setRunResult({ ok: false, message: data.error || `Build failed (${res.status}).` });
      }
    } catch (err) {
      setRunResult({ ok: false, message: err instanceof Error ? err.message : "Build request failed." });
    } finally {
      setBuilding(false);
    }
  }

  const usProductCount = nodes.filter((n) => n.level === "us_product").length;
  const webFindCount = nodes.length - usProductCount;
  const mapMegatrendCount = mapNodes.filter((n) => n.level === "megatrend").length;

  return (
    <div>
      <PageHeader
        title="Discover"
        description="Everything new the system has found: real products already in US retail, novelty-gated white-space ideas from the open web, and a bottom-up check on the megatrend taxonomy itself — all in one place."
        img="/subtrends/flavor-0.webp"
        badge="Innovation Intelligence"
        stats={[
          { value: usProductCount, label: "new US products" },
          { value: webFindCount, label: "web discoveries" },
          { value: scoutIdeas.length, label: "white-space finds" },
          { value: mapMegatrendCount, label: "megatrends mapped" },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {(tab === "all" || tab === "market") && (
              <div className="flex rounded-full border border-white/20 bg-white/10 p-0.5 text-xs backdrop-blur-sm">
                {PERIODS.map((p) => (
                  <button key={p.w} onClick={() => setPeriodWeeks(p.w)}
                    className={`rounded-full px-2.5 py-1 font-medium transition-colors ${periodWeeks === p.w ? "bg-white text-slate-900" : "text-white/70 hover:text-white"}`}>
                    {p.l}
                  </button>
                ))}
              </div>
            )}
            {!HOSTED && (tab === "all" || tab === "market") && (
              <button onClick={triggerDiscover} disabled={discovering}
                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-100 disabled:opacity-50">
                {discovering ? "Discovering…" : "Discover from web"}
              </button>
            )}
            {!HOSTED && (tab === "all" || tab === "whitespace") && (
              <button onClick={runScout} disabled={scouting}
                title="Runs a real web harvest plus LLM extraction and gating — takes 10-20 minutes."
                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-100 disabled:opacity-50">
                {scouting ? "Scouting… (can take 10–20 min)" : "▶ Run Scout"}
              </button>
            )}
            {!HOSTED && (tab === "all" || tab === "map") && (
              <button onClick={buildMap} disabled={building}
                title="Rebuilds the bottom-up megatrend taxonomy from a fresh web harvest — takes a couple minutes."
                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-100 disabled:opacity-50">
                {building ? "Building… (can take a couple minutes)" : "▶ Build Map"}
              </button>
            )}
          </div>
        }
      />

      <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                tab === t.key ? "bg-slate-900 text-white" : "bg-white text-slate-600 shadow-sm hover:bg-slate-100"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {runResult && (
          <div className={`rounded-xl border p-4 text-sm ${
            runResult.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}>
            {runResult.message}
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-slate-400">Loading…</div>
        ) : (
          <>
            {(tab === "all" || tab === "market") && (
              <section>
                {tab === "all" && <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">New in Market</h2>}
                <MarketSection nodes={nodes} periodWeeks={periodWeeks} />
              </section>
            )}
            {(tab === "all" || tab === "whitespace") && (
              <section>
                {tab === "all" && <h2 className="mb-3 mt-2 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">White Space</h2>}
                <WhiteSpaceSection ideas={scoutIdeas} subtrends={subtrends} />
              </section>
            )}
            {(tab === "all" || tab === "map") && (
              <section>
                {tab === "all" && <h2 className="mb-3 mt-2 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Trend Map · is our megatrend taxonomy still right?</h2>}
                <TrendMapSection nodes={mapNodes} />
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
