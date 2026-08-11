"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { ReportDetail, TaxonomyNode, TrendSearch } from "@/lib/types";

// Stats over a (possibly sliced) weekly series — recomputed for the chosen time window.
function windowStats(series: number[]) {
  const v = series.filter((x) => Number.isFinite(x));
  const m = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  if (v.length < 2) return { current: v.length ? Math.round(v[v.length - 1]) : null, yoy: null as number | null, rising: false, hasData: v.some((x) => x > 0) };
  const current = Math.round(m(v.slice(-Math.min(4, v.length))));
  const prior = m(v.slice(0, Math.min(4, v.length)));
  const yoy = prior > 0 ? Math.round((current / prior - 1) * 1000) / 10 : null;
  const rising = yoy != null && yoy >= 15 && current >= 2;
  return { current, yoy, rising, hasData: current > 0 };
}

function GrowthBadge({ series }: { series: number[] }) {
  const st = windowStats(series);
  if (!st.hasData) return <span className="text-xs text-slate-400">no data</span>;
  if (st.rising) {
    return (
      <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
        ▲ {st.yoy != null ? `+${Math.round(st.yoy)}%` : "rising"}
      </span>
    );
  }
  const down = st.yoy != null && st.yoy < -10;
  return (
    <span className={`rounded px-2 py-0.5 text-xs ${down ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}>
      {down ? "▼ " : ""}{st.current ?? "—"}
      {st.yoy != null ? ` · ${st.yoy > 0 ? "+" : ""}${Math.round(st.yoy)}%` : ""}
    </span>
  );
}

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [measuring, setMeasuring] = useState(false);
  const [mtId, setMtId] = useState<string | null>(null);
  const [stId, setStId] = useState<string | null>(null);
  const [periodWeeks, setPeriodWeeks] = useState(52);

  const loadData = useCallback(async () => {
    const d = await fetch(`/api/report/${id}`).then((r) => r.json());
    setData(d);
  }, [id]);

  useEffect(() => { loadData().finally(() => setLoading(false)); }, [loadData]);

  // While measuring, poll so growth badges fill in live; auto-stop after ~4 min.
  useEffect(() => {
    if (!measuring) return;
    const iv = setInterval(loadData, 6000);
    const stop = setTimeout(() => setMeasuring(false), 240000);
    return () => { clearInterval(iv); clearTimeout(stop); };
  }, [measuring, loadData]);

  async function measure() {
    setMeasuring(true);
    try { await fetch(`/api/measure/${id}`, { method: "POST" }); } catch { /* ignore */ }
  }

  const model = useMemo(() => {
    if (!data) return null;
    const { nodes, searches } = data;
    const searchByNode = new Map(searches.map((s) => [s.node_id, s]));
    const megatrends = nodes.filter((n) => n.level === "megatrend");
    const childrenOf = (parentId: string, level: string) =>
      nodes.filter((n) => n.parent_id === parentId && n.level === level);

    const risingByMt = new Map<string, number>();
    const risingBySt = new Map<string, number>(); // key: `${megatrend}|${subtrend}`
    for (const s of searches) {
      if (!s.is_rising) continue;
      if (s.megatrend_name) risingByMt.set(s.megatrend_name, (risingByMt.get(s.megatrend_name) ?? 0) + 1);
      const k = `${s.megatrend_name}|${s.subtrend_name}`;
      risingBySt.set(k, (risingBySt.get(k) ?? 0) + 1);
    }
    // Theme rollups: composite trend line + momentum per subtrend and per megatrend.
    const compositeBySt = new Map<string, Rollup>();
    const compositeByMt = new Map<string, Rollup>();
    for (const mt of megatrends) {
      const mtLeaves: (TrendSearch | undefined)[] = [];
      for (const st of childrenOf(mt.node_id, "subtrend")) {
        const stLeaves = [
          ...childrenOf(st.node_id, "product"),
          ...childrenOf(st.node_id, "ingredient"),
        ].map((n) => searchByNode.get(n.node_id));
        compositeBySt.set(st.node_id, rollupSearches(stLeaves, periodWeeks));
        mtLeaves.push(...stLeaves);
      }
      compositeByMt.set(mt.node_id, rollupSearches(mtLeaves, periodWeeks));
    }

    const totalRising = searches.filter((s) => s.is_rising).length;
    return { megatrends, childrenOf, searchByNode, risingByMt, risingBySt, totalRising, compositeBySt, compositeByMt };
  }, [data, periodWeeks]);

  // Default selection once data loads.
  useEffect(() => {
    if (!model || mtId) return;
    const firstMt = model.megatrends[0];
    if (firstMt) {
      setMtId(firstMt.node_id);
      setStId(model.childrenOf(firstMt.node_id, "subtrend")[0]?.node_id ?? null);
    }
  }, [model, mtId]);

  if (loading) return <div className="flex min-h-screen items-center justify-center text-slate-400">Loading…</div>;
  if (!data?.report || !model) {
    return (
      <div className="p-8">
        <Link href="/" className="text-sm text-slate-400 hover:text-white">← Reports</Link>
        <div className="mt-6 text-slate-400">Report not found.</div>
      </div>
    );
  }

  const { report } = data;
  const { megatrends, childrenOf, searchByNode, risingByMt, risingBySt, totalRising, compositeBySt, compositeByMt } = model;
  const leafCount = data.nodes.filter((n) => n.level === "product" || n.level === "ingredient").length;
  const measuredCount = data.searches.filter((s) => s.has_data).length;
  const subtrends = mtId ? childrenOf(mtId, "subtrend") : [];
  const activeSt = subtrends.find((s) => s.node_id === stId) ?? subtrends[0];
  const activeMt = megatrends.find((m) => m.node_id === mtId);
  const mtName = activeMt?.name ?? "";

  const orderLeaves = (leaves: TaxonomyNode[]) =>
    [...leaves].sort((a, b) => {
      const sa = searchByNode.get(a.node_id), sb = searchByNode.get(b.node_id);
      return Number(!!sb?.is_rising) - Number(!!sa?.is_rising) ||
        (sb?.current_interest ?? -1) - (sa?.current_interest ?? -1);
    });

  return (
    <div className="flex h-screen flex-col p-6">
      {/* Header */}
      <div className="mb-4 flex items-end justify-between">
        <div>
          <Link href="/" className="text-xs text-slate-500 hover:text-slate-900">← Reports</Link>
          <div className="mt-1 flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">{report.title || report.filename}</h1>
            {report.document_date && (
              <span
                title="Date the report states about itself (coverage period or publication date)"
                className="shrink-0 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600"
              >
                🗓 {report.document_date}
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500">
            {report.filename} · uploaded {new Date(report.uploaded_at).toLocaleString()}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-xs" title="Time window for the trend charts & growth">
            {[{ w: 13, l: "3M" }, { w: 26, l: "6M" }, { w: 52, l: "12M" }].map((p) => (
              <button key={p.w} onClick={() => setPeriodWeeks(p.w)}
                className={`rounded-md px-2.5 py-1 font-medium ${periodWeeks === p.w ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                {p.l}
              </button>
            ))}
          </div>
          <div className="text-right text-sm">
            <span className="font-semibold text-emerald-600">▲ {totalRising} rising</span>
            <div className="text-xs text-slate-500">
              {measuredCount}/{leafCount} measured · {megatrends.length} megatrends
            </div>
          </div>
          <button
            onClick={measure}
            disabled={measuring}
            title="Measure Google Trends growth for this report's products & ingredients (cached after)"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {measuring ? "Measuring… (keep this open)" : "Measure Google Trends"}
          </button>
        </div>
      </div>

      {/* 3-pane explorer */}
      <div className="grid min-h-0 flex-1 grid-cols-12 gap-4">
        {/* Pane 1: megatrends */}
        <Pane title="Megatrends" className="col-span-3">
          {megatrends.map((mt) => {
            const rising = risingByMt.get(mt.name) ?? 0;
            const active = mt.node_id === mtId;
            return (
              <button
                key={mt.node_id}
                onClick={() => { setMtId(mt.node_id); setStId(childrenOf(mt.node_id, "subtrend")[0]?.node_id ?? null); }}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm ${
                  active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <span className="truncate">{mt.name}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <MomentumChip r={compositeByMt.get(mt.node_id)} />
                  {rising > 0 && <span className="text-[10px] text-slate-500" title={`${rising} items rising`}>{rising}↑</span>}
                </span>
              </button>
            );
          })}
        </Pane>

        {/* Pane 2: subtrends */}
        <Pane title={`Subtrends${mtName ? " · " + mtName : ""}`} className="col-span-3">
          {activeMt?.description && (
            <p className="mb-2 border-b border-slate-100 px-3 pb-2 text-sm leading-relaxed text-slate-600">{activeMt.description}</p>
          )}
          {subtrends.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-600">No subtrends.</div>
          ) : subtrends.map((st) => {
            const rising = risingBySt.get(`${mtName}|${st.name}`) ?? 0;
            const active = st.node_id === activeSt?.node_id;
            return (
              <button
                key={st.node_id}
                onClick={() => setStId(st.node_id)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm ${
                  active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <span className="truncate">{st.name}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <MomentumChip r={compositeBySt.get(st.node_id)} />
                  {rising > 0 && <span className="text-[10px] text-slate-500" title={`${rising} items rising`}>{rising}↑</span>}
                </span>
              </button>
            );
          })}
        </Pane>

        {/* Pane 3: detail */}
        <Pane title="Detail" className="col-span-6">
          {!activeSt ? (
            <div className="px-3 py-2 text-sm text-slate-600">Select a subtrend.</div>
          ) : (
            <div className="space-y-5">
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">Subtrend</div>
                <div className="mt-0.5 text-lg font-bold text-slate-900">{activeSt.name}</div>
                {activeSt.description && <p className="mt-1 text-sm text-slate-600">{activeSt.description}</p>}
              </div>

              {(() => {
                const roll = compositeBySt.get(activeSt.node_id);
                return roll && roll.series.length >= 2 ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <TrendChart
                      series={roll.series}
                      title={`${activeSt.name} — theme momentum`}
                      yoy={roll.yoy}
                      current={roll.current}
                      note={`Composite · avg of ${roll.count} measured items · 0–100`}
                    />
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
                    No measured items yet for this subtrend — hit “Measure Google Trends” above.
                  </div>
                );
              })()}

              <LeafBlock label="What to make — products" hint="click a product for its Google Trends"
                expandable weeks={periodWeeks}
                leaves={orderLeaves(childrenOf(activeSt.node_id, "product"))} searchByNode={searchByNode} />
              <LeafBlock label="What's in it — ingredients" hint="click an ingredient for its Google Trends"
                expandable weeks={periodWeeks}
                leaves={orderLeaves(childrenOf(activeSt.node_id, "ingredient"))} searchByNode={searchByNode} />

              <ChipBlock label="What people do" color="bg-indigo-100 text-indigo-700"
                items={childrenOf(activeSt.node_id, "behaviour")} />
              <ChipBlock label="Why they do it" color="bg-fuchsia-100 text-fuchsia-700"
                items={childrenOf(activeSt.node_id, "psychographic")} />
            </div>
          )}
        </Pane>
      </div>
    </div>
  );
}

function Pane({ title, className, children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <div className="shrink-0 border-b border-slate-200 px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
        {title}
      </div>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">{children}</div>
    </div>
  );
}

function LeafBlock({
  label, hint, leaves, searchByNode, expandable, weeks,
}: { label: string; hint?: string; leaves: TaxonomyNode[]; searchByNode: Map<string, TrendSearch>; expandable?: boolean; weeks: number }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (!leaves.length) return null;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-600">{label}</span>
        <span className="text-xs text-slate-400">({leaves.length})</span>
        {hint && <span className="ml-auto text-[10px] text-slate-400">{hint}</span>}
      </div>
      <div className="space-y-1">
        {leaves.map((n) => {
          const s = searchByNode.get(n.node_id);
          const open = openId === n.node_id;
          const series = parseSeries(s?.interest_series).slice(-weeks);
          const st = windowStats(series);
          return (
            <div key={n.node_id}>
              <div
                onClick={expandable ? () => setOpenId(open ? null : n.node_id) : undefined}
                className={`flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-1.5 text-sm ${
                  expandable ? "cursor-pointer hover:bg-slate-100" : ""
                }`}
              >
                <span className="flex min-w-0 items-center gap-1.5 text-slate-800">
                  {expandable && <span className={`text-[10px] text-slate-500 transition-transform ${open ? "rotate-90" : ""}`}>▶</span>}
                  <span className="truncate">{n.search_term || n.name}</span>
                </span>
                <GrowthBadge series={series} />
              </div>
              {expandable && open && (
                <div className="mt-1 mb-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                  {series.length >= 2 ? (
                    <TrendChart series={series} title={n.search_term || n.name} yoy={st.yoy} current={st.current} />
                  ) : (
                    <div className="py-6 text-center text-xs text-slate-500">
                      No Google Trends data yet — hit “Measure Google Trends” above.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function parseSeries(raw?: string | null): number[] {
  if (!raw) return [];
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a) ? a.map(Number).filter((v) => Number.isFinite(v)) : [];
  } catch {
    return [];
  }
}

// A "theme" rollup: average the weekly interest series of every measured item under a
// subtrend (or megatrend) into one composite line, then derive its own momentum.
// Each Google Trends series is independently 0–100, so this is a directional read of the
// theme's shape/momentum — not absolute volume. Mirrors map_searches thresholds (+15% YoY).
type Rollup = { series: number[]; current: number | null; yoy: number | null; rising: boolean; count: number };

function rollupSearches(searches: (TrendSearch | undefined)[], weeks: number): Rollup {
  const arrays = searches.map((s) => parseSeries(s?.interest_series).slice(-weeks)).filter((a) => a.length >= 2);
  if (!arrays.length) return { series: [], current: null, yoy: null, rising: false, count: 0 };
  const maxLen = Math.max(...arrays.map((a) => a.length));
  const series: number[] = [];
  for (let fromEnd = maxLen - 1; fromEnd >= 0; fromEnd--) {
    const vals: number[] = [];
    for (const a of arrays) {
      const idx = a.length - 1 - fromEnd; // align series by their most-recent week
      if (idx >= 0) vals.push(a[idx]);
    }
    series.push(vals.length ? Math.round(vals.reduce((x, y) => x + y, 0) / vals.length) : 0);
  }
  const mean = (xs: number[]) => xs.reduce((x, y) => x + y, 0) / xs.length;
  const current = series.length ? Math.round(mean(series.slice(-4))) : null;
  const prior = series.length >= 8 ? mean(series.slice(0, 4)) : null;
  const yoy = prior && prior > 0 && current != null ? Math.round((current / prior - 1) * 1000) / 10 : null;
  const rising = yoy != null && yoy >= 15 && (current ?? 0) >= 2;
  return { series, current, yoy, rising, count: arrays.length };
}

// Compact theme-momentum chip for the megatrend/subtrend lists.
function MomentumChip({ r }: { r?: Rollup }) {
  if (!r || r.yoy == null) return null;
  const up = r.yoy >= 15, down = r.yoy <= -15;
  const cls = up ? "text-emerald-600" : down ? "text-rose-600" : "text-slate-400";
  return (
    <span className={`shrink-0 text-xs font-semibold ${cls}`} title={`Theme momentum · avg of ${r.count} measured items`}>
      {up ? "▲" : down ? "▼" : ""}{r.yoy > 0 ? "+" : ""}{Math.round(r.yoy)}%
    </span>
  );
}

// Weekly points ending ~now; label x-axis with approximate month abbreviations.
function TrendChart({ series, title, yoy, current, note }: { series: number[]; title: string; yoy?: number | null; current?: number | null; note?: string }) {
  const now = Date.now();
  const week = 7 * 24 * 3600 * 1000;
  const data = series.map((v, i) => ({
    i,
    v,
    label: new Date(now - (series.length - 1 - i) * week).toLocaleDateString(undefined, { month: "short" }),
  }));
  const step = Math.max(1, Math.floor(series.length / 6));
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="truncate text-sm font-semibold text-slate-900">{title}</span>
        <span className="text-[10px] text-slate-500">{note ?? "Google Trends interest · 0–100 · last 12 mo"}</span>
      </div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: -22 }}>
            <XAxis
              dataKey="label" interval={step - 1} tickLine={false} axisLine={{ stroke: "#e2e8f0" }}
              tick={{ fill: "#64748b", fontSize: 10 }}
            />
            <YAxis
              domain={[0, 100]} tickLine={false} axisLine={false}
              tick={{ fill: "#64748b", fontSize: 10 }} width={40}
            />
            <Tooltip
              contentStyle={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "#64748b" }} itemStyle={{ color: "#059669" }}
              formatter={(v: number) => [v, "interest"]}
            />
            <Line type="monotone" dataKey="v" stroke="#059669" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {yoy != null && (
        <div className="mt-1 text-[11px] text-slate-500">
          YoY {yoy > 0 ? "+" : ""}{Math.round(yoy)}% · current {current ?? "—"}/100
        </div>
      )}
    </div>
  );
}

function ChipBlock({ label, color, items }: { label: string; color: string; items: TaxonomyNode[] }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-slate-600">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((n) => (
          <span key={n.node_id} title={n.description ?? undefined}
            className={`rounded-md px-2 py-0.5 text-xs ${color} ${n.description ? "cursor-help" : ""}`}>
            {n.name}
          </span>
        ))}
      </div>
    </div>
  );
}
