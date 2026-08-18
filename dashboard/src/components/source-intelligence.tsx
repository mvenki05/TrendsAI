"use client";

import { useCallback, useEffect, useState } from "react";
import { levelLabel } from "@/lib/levels";

interface SourceReport {
  report_id: string;
  filename: string;
  title: string | null;
  document_date: string | null;
  num_megatrends: number | null;
  num_nodes: number | null;
  uploaded_at: string | null;
}

interface SourceNode {
  node_id: string;
  report_id: string;
  parent_id: string | null;
  level: string;
  name: string;
  description: string | null;
  search_term: string | null;
  megatrend_name: string | null;
  subtrend_name: string | null;
  yoy_growth: number | null;
  is_rising: boolean | null;
  has_data: boolean | null;
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

function EntityChip({ n }: { n: SourceNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${LEVEL_STYLE[n.level] ?? "bg-slate-100 text-slate-600"}`}>
        {levelLabel(n.level)}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold text-slate-800">{n.name}</span>
          {n.is_rising && n.yoy_growth != null && (
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
              ▲ +{Math.round(n.yoy_growth)}% search
            </span>
          )}
        </div>
        {n.description && (
          <div className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{n.description}</div>
        )}
      </div>
    </div>
  );
}

export default function SourceIntelligence({ tag, icon, title, blurb }: {
  tag: string; icon: string; title: string; blurb: string;
}) {
  const [reports, setReports] = useState<SourceReport[]>([]);
  const [nodes, setNodes] = useState<SourceNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/source/${tag}`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.reports)) setReports(d.reports);
        if (Array.isArray(d.nodes)) setNodes(d.nodes);
      })
      .finally(() => setLoading(false));
  }, [tag]);

  useEffect(() => { load(); }, [load]);

  function toggle(id: string) {
    setOpen((prev) => {
      const s = new Set(prev);
      if (s.has(id)) { s.delete(id); } else { s.add(id); }
      return s;
    });
  }

  const totalMT = reports.reduce((a, r) => a + (r.num_megatrends ?? 0), 0);
  const totalNodes = reports.reduce((a, r) => a + (r.num_nodes ?? 0), 0);
  const subtrendCount = nodes.filter((n) => n.level === "subtrend").length;

  return (
    <div className="space-y-5 p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{icon} {title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">{blurb}</p>
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-400">Loading…</div>
      ) : reports.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-400">
          No reports yet for this source.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="text-2xl font-bold tabular-nums text-slate-900">{reports.length}</div>
              <div className="text-xs font-medium text-slate-500">reports</div>
            </div>
            <div className="flex-1 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-indigo-700 shadow-sm">
              <div className="text-2xl font-bold tabular-nums">{totalMT}</div>
              <div className="text-xs font-medium opacity-80">megatrends</div>
            </div>
            <div className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="text-2xl font-bold tabular-nums text-slate-900">{subtrendCount}</div>
              <div className="text-xs font-medium text-slate-500">subtrends</div>
            </div>
            <div className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="text-2xl font-bold tabular-nums text-slate-900">{totalNodes}</div>
              <div className="text-xs font-medium text-slate-500">evidence nodes</div>
            </div>
          </div>

          <div className="space-y-2">
            {reports.map((r) => {
              const isOpen = open.has(r.report_id);
              const rNodes = nodes.filter((n) => n.report_id === r.report_id);
              const megatrends = rNodes.filter((n) => n.level === "megatrend");
              return (
                <div key={r.report_id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
                  <button onClick={() => toggle(r.report_id)}
                          className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-slate-50">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={`text-xs text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>
                      <span className="truncate font-semibold text-slate-900">{r.title || r.filename}</span>
                      {r.document_date && (
                        <span className="shrink-0 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          🗓 {r.document_date}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-slate-500">
                      {r.num_megatrends} megatrends · {r.num_nodes} nodes
                    </span>
                  </button>

                  {isOpen && (
                    <div className="space-y-4 border-t border-slate-200 px-5 py-4">
                      {megatrends.map((m, i) => {
                        const subs = rNodes.filter((n) => n.level === "subtrend" && n.megatrend_name === m.name);
                        return (
                          <div key={m.node_id} className="overflow-hidden rounded-2xl border border-slate-200">
                            <div className={`h-1 w-full ${ACCENT[i % ACCENT.length]}`} />
                            <div className="px-5 pt-4 pb-3">
                              <h3 className="text-base font-bold leading-snug text-slate-900">{m.name}</h3>
                              {m.description && (
                                <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-slate-500">{m.description}</p>
                              )}
                            </div>
                            <div className="space-y-3 border-t border-slate-100 px-5 py-4">
                              {subs.map((s) => {
                                const kids = rNodes.filter((n) => n.parent_id === s.node_id);
                                return (
                                  <div key={s.node_id}>
                                    <div className="text-sm font-bold text-slate-700">{s.name}</div>
                                    {s.description && <div className="mt-0.5 text-[11px] text-slate-400">{s.description}</div>}
                                    {kids.length > 0 && (
                                      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                                        {kids.map((n) => <EntityChip key={n.node_id} n={n} />)}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-xs text-slate-500">
            ▲ = rising on Google Trends (fills in as measurement runs) · every node was extracted strictly from the
            report text; survey percentages are preserved in descriptions.
          </p>
        </>
      )}
    </div>
  );
}
