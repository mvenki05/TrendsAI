"use client";

import { useCallback, useEffect, useState } from "react";

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

interface Src {
  title?: string;
  url?: string | null;
  source?: string;
}

function parseSources(raw: string | null): Src[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function parseNames(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function Sparkline({ series, rising }: { series: number[]; rising: boolean }) {
  if (series.length < 2) return null;
  const w = 110, h = 30;
  const max = Math.max(...series), min = Math.min(...series), rng = max - min || 1;
  const pts = series.map((v, i) => `${(i / (series.length - 1)) * w},${h - ((v - min) / rng) * (h - 4) - 2}`).join(" ");
  return (
    <svg width={w} height={h} className="shrink-0" aria-hidden>
      <polyline points={pts} fill="none" stroke={rising ? "#059669" : "#94a3b8"} strokeWidth={1.75}
                strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
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
  if (idea.has_data == null) return null; // not validated yet
  const series = parseNames(idea.interest_series).map(Number).filter((v) => !Number.isNaN(v));
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
      {idea.has_data && <Sparkline series={series.slice(-52)} rising={!!idea.is_rising} />}
    </div>
  );
}

function SubtrendCard({ s }: { s: Subtrend }) {
  const members = parseNames(s.idea_names);
  return (
    <div className="flex flex-col rounded-xl border border-indigo-200 bg-white p-4 shadow-sm">
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

function IdeaCard({ idea }: { idea: WhiteSpaceIdea }) {
  const sources = parseSources(idea.sources);
  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
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
                <span>↗</span>{s.source || s.title || "Source"}
              </a>
            ) : (
              <span key={i} className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                {s.source || s.title || "Source"}
              </span>
            )
          )}
        </div>
      )}
    </div>
  );
}

export default function LabPage() {
  const [ideas, setIdeas] = useState<WhiteSpaceIdea[]>([]);
  const [subtrends, setSubtrends] = useState<Subtrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [tysonOnly, setTysonOnly] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/lab")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.ideas)) setIdeas(d.ideas);
        if (Array.isArray(d.subtrends)) setSubtrends(d.subtrends);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const runScout = async () => {
    setRunning(true);
    await fetch("/api/lab/run", { method: "POST" });
  };

  const buildableCount = ideas.filter((i) => i.buildable).length;
  const shown = tysonOnly ? ideas.filter((i) => i.buildable) : ideas;
  const runDate = ideas[0]?.created_at ? new Date(ideas[0].created_at).toLocaleString() : null;

  return (
    <div className="space-y-5 p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">🔭 White Space Scout</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            New formats, dishes, and occasion plays from around the world that land in <strong>Tyson&apos;s real product
            categories</strong> — but that nothing in the decks, discovery, or the ideas pipeline tracks yet. Two gates:
            new to the system, and anchored to a category Tyson actually runs.
          </p>
          {runDate && <p className="mt-1 text-xs text-slate-400">Last scout run: {runDate}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load}
                  className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Refresh
          </button>
          <button onClick={runScout} disabled={running}
                  className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-700 disabled:opacity-50">
            {running ? "Scouting… (10–20 min, refresh later)" : "▶ Run Scout"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-400">Loading…</div>
      ) : ideas.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-400">
          No scout runs yet — hit <span className="font-semibold text-slate-600">Run Scout</span> to
          hunt the internet for ideas nothing in the system covers.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-violet-700 shadow-sm">
              <span className="text-xl font-bold tabular-nums">{ideas.length}</span>
              <span className="ml-1.5 text-xs font-medium opacity-80">surprising finds</span>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-emerald-700 shadow-sm">
              <span className="text-xl font-bold tabular-nums">{buildableCount}</span>
              <span className="ml-1.5 text-xs font-medium opacity-80">with a Tyson angle</span>
            </div>
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={tysonOnly} onChange={(e) => setTysonOnly(e.target.checked)}
                     className="h-4 w-4 rounded border-slate-300 accent-emerald-600" />
              Tyson-buildable only
            </label>
          </div>

          {subtrends.length > 0 && (
            <div>
              <div className="mb-2 flex items-baseline gap-2">
                <h2 className="text-lg font-bold text-slate-900">📈 Emerging subtrends</h2>
                <span className="text-xs text-slate-500">
                  clustered bottom-up from all scout finds — <span className="font-semibold text-indigo-600">NEW TERRITORY</span> = no uploaded megatrend covers it
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {subtrends.map((s) => <SubtrendCard key={s.subtrend_id} s={s} />)}
              </div>
            </div>
          )}

          <div className="mb-2 flex items-baseline gap-2 pt-1">
            <h2 className="text-lg font-bold text-slate-900">This run&apos;s finds</h2>
            <span className="text-xs text-slate-500">ranked by Tyson fit · demand bar fills in after validation</span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((i) => <IdeaCard key={i.idea_id} idea={i} />)}
          </div>

          <p className="text-xs text-slate-500">
            ✦ = novelty score (distance from mainstream US retail) · ranked by Tyson fit, then novelty · difference vs
            the Ideas page: these come from internet white space and are guaranteed new to the system, not derived from
            the megatrends.
          </p>
        </>
      )}
    </div>
  );
}
