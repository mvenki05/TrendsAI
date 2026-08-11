"use client";

import { useCallback, useEffect, useState } from "react";
import { levelLabel } from "@/lib/levels";

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

interface Src {
  title?: string;
  url?: string | null;
  source?: string;
}

const ACCENT = [
  "bg-emerald-500", "bg-orange-500", "bg-sky-500", "bg-amber-500",
  "bg-teal-500", "bg-purple-500", "bg-indigo-500", "bg-cyan-500",
];

const LEVEL_STYLE: Record<string, string> = {
  product:       "bg-sky-100 text-sky-700",
  ingredient:    "bg-emerald-100 text-emerald-700",
  behaviour:     "bg-amber-100 text-amber-700",
  psychographic: "bg-violet-100 text-violet-700",
};

function parseSources(raw: string | null): Src[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function GeoBadge({ geo }: { geo: string | null }) {
  if (!geo) return null;
  const us = geo.toUpperCase() === "US";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${us ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-600"}`}>
      {us ? "🇺🇸 US" : `🌍 ${geo}`}
    </span>
  );
}

function EntityChip({ n }: { n: MapNode }) {
  const src = parseSources(n.sources)[0];
  return (
    <div className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${LEVEL_STYLE[n.level] ?? "bg-slate-100 text-slate-600"}`}>
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

export default function MapPage() {
  const [nodes, setNodes] = useState<MapNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/map")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.nodes)) setNodes(d.nodes);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const runMap = async () => {
    setRunning(true);
    await fetch("/api/map/run", { method: "POST" });
  };

  const megatrends = nodes.filter((n) => n.level === "megatrend");
  const unassigned = nodes.filter((n) => n.level !== "megatrend" && n.level !== "subtrend" && !n.megatrend_name);
  const builtDate = megatrends[0]?.created_at ? new Date(megatrends[0].created_at).toLocaleString() : null;

  return (
    <div className="space-y-5 p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">🗺️ Our Trend Map</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            The agency-deck grammar — megatrend → subtrends → ingredients, products, behaviours, psychographics —
            authored by us, bottom-up from world + US internet evidence. Every node cites its sources; every
            megatrend is compared against the uploaded decks.
          </p>
          {builtDate && <p className="mt-1 text-xs text-slate-400">Last build: {builtDate}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load}
                  className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Refresh
          </button>
          <button onClick={runMap} disabled={running}
                  className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-700 disabled:opacity-50">
            {running ? "Building… (10–20 min, refresh later)" : "▶ Build Map"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-400">Loading…</div>
      ) : megatrends.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-400">
          No map yet — hit <span className="font-semibold text-slate-600">Build Map</span> to author the first
          bottom-up megatrend report from the internet.
        </div>
      ) : (
        <div className="space-y-4">
          {megatrends.map((m, i) => {
            const subs = nodes.filter((n) => n.level === "subtrend" && n.megatrend_name === m.name);
            return (
              <div key={m.node_id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className={`h-1 w-full ${ACCENT[i % ACCENT.length]}`} />
                <div className="px-6 pt-5 pb-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h2 className="text-lg font-bold leading-snug text-slate-900">{m.name}</h2>
                    <div className="flex flex-wrap gap-1.5">
                      <GeoBadge geo={m.geo} />
                      {m.overlap_deck ? (
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600"
                              title={`The uploaded decks call this “${m.overlap_deck}”`}>
                          ✓ decks agree
                        </span>
                      ) : (
                        <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-700">
                          NEW — not in decks
                        </span>
                      )}
                    </div>
                  </div>
                  {m.description && (
                    <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-500">{m.description}</p>
                  )}
                </div>
                <div className="space-y-4 border-t border-slate-100 px-6 py-5">
                  {subs.map((s) => {
                    const kids = nodes.filter((n) => n.parent_id === s.node_id);
                    return (
                      <div key={s.node_id}>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-700">{s.name}</span>
                          <GeoBadge geo={s.geo} />
                        </div>
                        {s.description && <div className="mt-0.5 text-[11px] text-slate-400">{s.description}</div>}
                        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {kids.map((n) => <EntityChip key={n.node_id} n={n} />)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {unassigned.length > 0 && (
            <details className="rounded-2xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
              <summary className="cursor-pointer text-sm font-semibold text-slate-500">
                {unassigned.length} corroborated signals not (yet) part of any megatrend
              </summary>
              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                {unassigned.map((n) => <EntityChip key={n.node_id} n={n} />)}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
