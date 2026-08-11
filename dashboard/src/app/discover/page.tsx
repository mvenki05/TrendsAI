"use client";

import { useCallback, useEffect, useState } from "react";
import { DiscoveredNode, DiscoverySource } from "@/lib/types";
import { levelLabel } from "@/lib/levels";
import { PERIODS, windowStats } from "@/lib/utils";

const LEVELS: { key: DiscoveredNode["level"]; label: string; dot: string; chart: boolean }[] = [
  { key: "subtrend", label: "Subtrends", dot: "bg-indigo-500", chart: false },
  { key: "product", label: "What to make", dot: "bg-sky-500", chart: false },
  { key: "ingredient", label: "What's in it", dot: "bg-emerald-500", chart: true },
  { key: "behaviour", label: "What people do", dot: "bg-fuchsia-500", chart: false },
  { key: "psychographic", label: "Why they do it", dot: "bg-amber-500", chart: false },
];

function parseJSON<T>(raw: string | null): T[] {
  if (!raw) return [];
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a : []; } catch { return []; }
}

function Tile({ value, label, tone }: { value: number; label: string; tone: "slate" | "sky" | "emerald" }) {
  const map = {
    slate: "border-slate-200 bg-white text-slate-900",
    sky: "border-sky-200 bg-sky-50 text-sky-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
  return (
    <div className={`flex-1 rounded-xl border px-4 py-3 shadow-sm ${map[tone]}`}>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs font-medium opacity-80">{label}</div>
    </div>
  );
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
  const [open, setOpen] = useState(false);
  const sources = parseJSON<DiscoverySource>(n.sources);
  return (
    <div className="flex flex-col rounded-xl border border-violet-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
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
    <div className="flex flex-col rounded-xl border border-rose-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
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
    <div className="rounded-xl border border-emerald-300 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
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

function Item({ n, withChart, weeks }: { n: DiscoveredNode; withChart: boolean; weeks: number }) {
  const [open, setOpen] = useState(false);
  const sources = parseJSON<DiscoverySource>(n.sources);
  const series = parseJSON<number>(n.interest_series).slice(-weeks);
  const st = windowStats(series);
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
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
              {s.source && <span className="text-slate-400"> — </span>}
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

export default function DiscoverPage() {
  const [nodes, setNodes] = useState<DiscoveredNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "discover">(null);
  const [openMega, setOpenMega] = useState<Set<string>>(new Set());
  const [defaultedOpen, setDefaultedOpen] = useState(false);
  const [periodWeeks, setPeriodWeeks] = useState(52);

  const load = useCallback(async () => {
    const d = await fetch("/api/discover").then((r) => r.json());
    if (Array.isArray(d)) setNodes(d);
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  useEffect(() => {
    if (!busy) return;
    const iv = setInterval(load, 8000);
    const stop = setTimeout(() => setBusy(null), 1200000);
    return () => { clearInterval(iv); clearTimeout(stop); };
  }, [busy, load]);

  async function trigger(kind: "discover") {
    setBusy(kind);
    try { await fetch("/api/discover/run", { method: "POST" }); } catch { /* ignore */ }
  }

  function toggle(m: string) {
    setOpenMega((prev) => { const s = new Set(prev); s.has(m) ? s.delete(m) : s.add(m); return s; });
  }

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
  const newCount = megaNodes.filter((n) => !n.in_deck).length;
  const risingCount = megaNodes.filter((n) => n.is_rising).length;

  if (!defaultedOpen && (order.length > 0 || byUniverse.size > 0)) {
    setOpenMega(new Set(byUniverse.size > 0 ? ["Protein"] : [order[0]]));
    setDefaultedOpen(true);
  }

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Web Discovery</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            <strong>US Market Radar</strong> — real products new in US retail, organized by eating occasion, each with
            the gap it exposes in Tyson&apos;s catalog. Below it, web discoveries per megatrend with Google Trends validation.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-xs" title="Time window for the trend sparklines & growth">
            {PERIODS.map((p) => (
              <button key={p.w} onClick={() => setPeriodWeeks(p.w)}
                className={`rounded-md px-2.5 py-1 font-medium ${periodWeeks === p.w ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                {p.l}
              </button>
            ))}
          </div>
          <button onClick={() => trigger("discover")} disabled={busy != null}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60">
            {busy === "discover" ? "Discovering…" : "Discover from web"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-slate-500">Loading…</div>
      ) : nodes.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-500">
          Nothing discovered yet — hit “Discover from web”. (Needs synthesized megatrends first.)
        </div>
      ) : (
        <>
          <div className="flex gap-3">
            <Tile value={usProducts.length} label="new US products" tone="sky" />
            <Tile value={byMega.size} label="megatrends" tone="slate" />
            <Tile value={megaNodes.length} label="discoveries" tone="slate" />
            <Tile value={risingCount} label="rising on Trends" tone="emerald" />
          </div>

          {byUniverse.size > 0 && (
            <div>
              <div className="mb-1 flex items-baseline gap-2">
                <h2 className="text-lg font-bold text-slate-900">US Market Radar</h2>
                <span className="text-xs text-slate-500">
                  Real products, new in US retail (2024–2026), mapped against what Tyson actually makes
                </span>
              </div>
              <div className="space-y-2">
                {UNIVERSE_ORDER.filter((u) => byUniverse.has(u.key)).map(({ key, icon }) => {
                  const items = byUniverse.get(key)!;
                  const open = openMega.has(key);
                  return (
                    <div key={key} className="overflow-hidden rounded-xl border border-rose-200 bg-white shadow-sm transition-shadow hover:shadow-md">
                      <button onClick={() => toggle(key)}
                        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-rose-50/50">
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
                        <div className="border-t border-rose-100 px-5 py-4">
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

          <div className="mb-1 flex items-baseline gap-2 pt-2">
            <h2 className="text-lg font-bold text-slate-900">Megatrend Discoveries</h2>
            <span className="text-xs text-slate-500">Open a megatrend to see its rising finds and full detail.</span>
          </div>
          <div className="space-y-2">
            {order.map((mega) => {
              const items = byMega.get(mega)!;
              const open = openMega.has(mega);
              const mNew = items.filter((i) => !i.in_deck).length;
              const megaRising = items.filter((i) => i.is_rising)
                .sort((a, b) => Number(!!b.is_durable) - Number(!!a.is_durable) || (b.yoy_growth ?? 0) - (a.yoy_growth ?? 0));
              const desc = items.find((i) => i.mega_description)?.mega_description;
              return (
                <div key={mega} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
                  <button onClick={() => toggle(mega)}
                    className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-slate-50">
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
                    <div className="border-t border-slate-200 px-5 py-4">
                      {desc && <p className="mb-4 text-sm leading-relaxed text-slate-600">{desc}</p>}

                      {megaRising.length > 0 && (
                        <div className="mb-5">
                          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-600">
                            🔥 Rising on Google Trends ({megaRising.length})
                          </div>
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
                            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-600">
                              💡 Global Innovations ({innovations.length})
                            </div>
                            <p className="mb-3 text-[11px] text-slate-500">
                              Novel product concepts from around the world — unexpected formats, delivery mechanisms,
                              and category-crossing ideas that show where this megatrend is heading.
                            </p>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                              {innovations.map((n) => <InnovationCard key={n.discovery_id} n={n} />)}
                            </div>
                          </div>
                        );
                      })()}

                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">All discoveries</div>
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
                              <div className="space-y-1">{rows.map((n) => <Item key={n.discovery_id} n={n} withChart={chart} weeks={periodWeeks} />)}</div>
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

          <p className="text-xs text-slate-500">
            <span className="rounded bg-sky-100 px-1 py-0.5 font-semibold text-sky-700">NEW</span> = not in any uploaded
            deck · <span className="text-emerald-600">▲</span> = rising on Google Trends · sparkline = last 12 months of
            search interest · sources are free Google News + trade press (≥2 independent sources shown).
          </p>
        </>
      )}
    </div>
  );
}
