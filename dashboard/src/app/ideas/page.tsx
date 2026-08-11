"use client";

import { useEffect, useState } from "react";

type Idea = {
  idea_id: string;
  megatrend: string;
  name: string;
  description: string;
  rides_subtrend: string;
  evidence: string;
  tyson_brand: string;
  format: string;
  fit_verdict?: string | null;
  fit_brand?: string | null;
  fit_match_count?: number | null;
  fit_examples?: string | null;
  permission_tier?: string | null;
  permission_reason?: string | null;
  occasion?: string | null;
  validation?: string | null;
  validation_reason?: string | null;
  evidence_manifestation?: string | null;
  evidence_sources?: string | null;
  mega_description?: string | null;
};

type Src = { title: string; url: string | null; source: string };

type Recipe = {
  recipe_id: string;
  megatrend: string;
  title: string;
  source?: string | null;
  url?: string | null;
};

function Tile({ value, label, tone }: { value: number; label: string; tone: "slate" | "amber" | "sky" }) {
  const map = {
    slate: "border-slate-200 bg-white text-slate-900",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    sky: "border-sky-200 bg-sky-50 text-sky-700",
  };
  return (
    <div className={`flex-1 rounded-xl border px-4 py-3 shadow-sm ${map[tone]}`}>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs font-medium opacity-80">{label}</div>
    </div>
  );
}

function parseList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a : []; } catch { return []; }
}

const TIER_STYLE: Record<string, { box: string; head: string; badge: string; icon: string }> = {
  Core:     { box: "border-emerald-200 bg-emerald-50", head: "text-emerald-700", badge: "bg-emerald-100 text-emerald-700", icon: "✓" },
  Adjacent: { box: "border-sky-200 bg-sky-50",         head: "text-sky-700",     badge: "bg-sky-100 text-sky-700",         icon: "◆" },
  Stretch:  { box: "border-orange-200 bg-orange-50",   head: "text-orange-700",  badge: "bg-orange-100 text-orange-700",   icon: "⚑" },
};

const VAL_STYLE: Record<string, string> = {
  Strong:   "bg-emerald-600 text-white",
  Moderate: "bg-amber-400 text-amber-950",
  Early:    "bg-slate-300 text-slate-700",
};

function IdeaCard({ i }: { i: Idea }) {
  const examples = parseList(i.fit_examples);
  const tier = i.permission_tier && TIER_STYLE[i.permission_tier] ? i.permission_tier : null;
  const ts = tier ? TIER_STYLE[tier] : null;
  const evSources: Src[] = (() => { try { const a = JSON.parse(i.evidence_sources || "[]"); return Array.isArray(a) ? a : []; } catch { return []; } })();
  return (
    <div className="flex flex-col rounded-xl border border-amber-300 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold text-slate-900">{i.name}</div>
        <div className="flex shrink-0 items-center gap-1">
          {i.validation && VAL_STYLE[i.validation] && (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${VAL_STYLE[i.validation]}`}
              title={`Validation: ${i.validation_reason || ""}`}>{i.validation}</span>
          )}
          {ts
            ? <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${ts.badge}`} title="Tyson permission to play">{tier}</span>
            : <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">concept</span>}
        </div>
      </div>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{i.description}</p>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
        <span className="rounded bg-slate-900 px-2 py-0.5 font-semibold text-white">{i.tyson_brand}</span>
        <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-600">{i.format}</span>
        {i.occasion && <span className="rounded bg-violet-50 px-2 py-0.5 font-medium text-violet-700" title="Occasion this rides">🕑 {i.occasion}</span>}
        <span className="rounded bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700" title="The manifestation this concept rides">
          ↳ {i.rides_subtrend}
        </span>
      </div>
      {i.evidence && (
        <div className="mt-2 border-t border-slate-100 pt-2 text-[11px] leading-relaxed text-slate-500">
          <span className="font-semibold text-slate-600">Why it&apos;s grounded: </span>
          {i.evidence}
        </div>
      )}
      {(i.permission_reason || i.fit_verdict) && (
        <div className={`mt-2 rounded-lg border px-2.5 py-2 text-[11px] leading-relaxed ${ts ? ts.box : "border-slate-200 bg-slate-50"}`}>
          <div className="flex items-center gap-1.5 font-semibold">
            <span>{ts ? ts.icon : "•"}</span>
            <span className={ts ? ts.head : "text-slate-700"}>
              {tier ? `${tier} — Tyson permission to play` : "Tyson fit"}
            </span>
          </div>
          <div className="mt-1 text-slate-600">{i.permission_reason || i.fit_verdict}</div>
          {examples.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-slate-500">
              {examples.map((e, k) => <li key={k} className="truncate font-mono text-[10px]" title={e}>· {e}</li>)}
            </ul>
          )}
        </div>
      )}
      {(i.evidence_manifestation || i.validation_reason) && (
        <details className="mt-2 border-t border-slate-100 pt-2 text-[11px]">
          <summary className="cursor-pointer font-semibold text-slate-600">Why this fits {i.megatrend}</summary>
          <div className="mt-1.5 space-y-1 text-slate-600">
            <div>Rides the manifestation <span className="font-medium text-indigo-700">“{i.evidence_manifestation || i.rides_subtrend}”</span>, which sits under this megatrend.</div>
            {i.validation_reason && <div><span className="font-semibold">Validation:</span> {i.validation_reason}.</div>}
            {evSources.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {evSources.map((s, k) => (
                  <li key={k} className="truncate text-[10px] text-slate-500" title={s.title}>
                    · {s.url
                        ? <a href={s.url} target="_blank" rel="noreferrer" className="text-sky-700 underline decoration-sky-300 hover:decoration-sky-600">{s.title}</a>
                        : s.title}
                    {s.source && <span className="text-slate-400"> — {s.source}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

export default function IdeasPage() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [openMega, setOpenMega] = useState<Set<string>>(new Set());
  const [defaultedOpen, setDefaultedOpen] = useState(false);

  useEffect(() => {
    fetch("/api/ideas")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.ideas)) setIdeas(d.ideas);
        if (Array.isArray(d.recipes)) setRecipes(d.recipes);
      })
      .finally(() => setLoading(false));
  }, []);

  function toggle(m: string) {
    setOpenMega((prev) => { const s = new Set(prev); s.has(m) ? s.delete(m) : s.add(m); return s; });
  }

  const order: string[] = [];
  const byMega = new Map<string, { ideas: Idea[]; desc?: string | null }>();
  for (const i of ideas) {
    if (!byMega.has(i.megatrend)) { byMega.set(i.megatrend, { ideas: [], desc: i.mega_description }); order.push(i.megatrend); }
    byMega.get(i.megatrend)!.ideas.push(i);
  }
  // Rank megatrends by number of Tyson concepts (most first), then alphabetically for ties.
  order.sort((a, b) => byMega.get(b)!.ideas.length - byMega.get(a)!.ideas.length || a.localeCompare(b));

  // recipes get their own section below all megatrends, grouped by the megatrend they belong to
  const recipeOrder: string[] = [];
  const recipesByMega = new Map<string, Recipe[]>();
  for (const r of recipes) {
    if (!recipesByMega.has(r.megatrend)) { recipesByMega.set(r.megatrend, []); recipeOrder.push(r.megatrend); }
    recipesByMega.get(r.megatrend)!.push(r);
  }

  if (!defaultedOpen && order.length > 0) {
    setOpenMega(new Set(order));
    setDefaultedOpen(true);
  }

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Innovation Ideas</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Grounded product concepts for the innovation team — each invented from a proven megatrend manifestation and a
          Tyson brand that has permission to play. Alongside them: the emerging real-world dishes people are already
          cooking, pulled fresh from the web as demand signal and inspiration.
        </p>
      </div>

      {loading ? (
        <div className="text-slate-500">Loading…</div>
      ) : ideas.length === 0 && recipes.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-500">
          No innovation ideas yet.
        </div>
      ) : (
        <>
          <div className="flex gap-3">
            <Tile value={byMega.size} label="megatrends" tone="slate" />
            <Tile value={ideas.length} label="Tyson concepts" tone="amber" />
            <Tile value={recipes.length} label="emerging recipes" tone="sky" />
          </div>

          {/* Legend */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] text-slate-600">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">How to read the badges</div>
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              <div>
                <div className="mb-1 font-semibold text-slate-700">Permission to play — Tyson's right to win in this space</div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5"><span className="rounded bg-emerald-100 px-1.5 py-0.5 font-bold text-emerald-700">✓ Core</span><span>Tyson already owns this space — existing brands, lines, and capabilities are a direct fit.</span></div>
                  <div className="flex items-center gap-1.5"><span className="rounded bg-sky-100 px-1.5 py-0.5 font-bold text-sky-700">◆ Adjacent</span><span>Natural stretch — brand permission is clear but may need a new format or slight capability extension.</span></div>
                  <div className="flex items-center gap-1.5"><span className="rounded bg-orange-100 px-1.5 py-0.5 font-bold text-orange-700">⚑ Stretch</span><span>New territory — Tyson could play here but brand permission must be built; higher risk, higher upside.</span></div>
                </div>
              </div>
              <div>
                <div className="mb-1 font-semibold text-slate-700">Validation — strength of real-world demand signal</div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5"><span className="rounded bg-emerald-600 px-1.5 py-0.5 font-bold text-white">Strong</span><span>Multiple signals (search, social, market data) confirm the trend is established and growing.</span></div>
                  <div className="flex items-center gap-1.5"><span className="rounded bg-amber-400 px-1.5 py-0.5 font-bold text-amber-950">Moderate</span><span>Signals are emerging across 1–2 sources; trend is gaining traction but not yet mainstream.</span></div>
                  <div className="flex items-center gap-1.5"><span className="rounded bg-slate-300 px-1.5 py-0.5 font-bold text-slate-700">Early</span><span>Nascent signal — high potential but limited data; worth watching before committing resources.</span></div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {order.map((mega) => {
              const bucket = byMega.get(mega)!;
              const open = openMega.has(mega);
              return (
                <div key={mega} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
                  <button onClick={() => toggle(mega)}
                    className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-slate-50">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={`text-xs text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
                      <span className="truncate font-semibold text-slate-900">{mega}</span>
                    </span>
                    <span className="shrink-0 text-xs text-slate-500">
                      <span className="text-amber-600">{bucket.ideas.length} concepts</span>
                    </span>
                  </button>
                  {open && (
                    <div className="border-t border-slate-200 px-5 py-4">
                      {bucket.desc && <p className="mb-4 text-sm leading-relaxed text-slate-600">{bucket.desc}</p>}

                      {bucket.ideas.length > 0 && (
                        <div className="mb-5">
                          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-600">
                            💡 Tyson concepts ({bucket.ideas.length})
                          </div>
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {bucket.ideas.map((i) => <IdeaCard key={i.idea_id} i={i} />)}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {recipes.length > 0 && (
            <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">🍳 Emerging recipes in the wild</h2>
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700">{recipes.length}</span>
              </div>
              <p className="mt-1 max-w-3xl text-sm text-slate-600">
                Real dishes people are cooking right now, pulled fresh from the open web — demand signal and inspiration
                that feeds the concepts above. Grouped by the megatrend they map to.
              </p>
              <div className="mt-4 space-y-4">
                {recipeOrder.map((mega) => (
                  <div key={mega}>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {mega} <span className="text-slate-400">({recipesByMega.get(mega)!.length})</span>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {recipesByMega.get(mega)!.map((r) => (
                        <div key={r.recipe_id} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                          {r.url
                            ? <a href={r.url} target="_blank" rel="noreferrer" className="font-medium text-sky-700 underline decoration-sky-300 hover:decoration-sky-600">{r.title}</a>
                            : <span className="font-medium text-slate-800">{r.title}</span>}
                          {r.source && <span className="ml-1 text-[11px] text-slate-400">· {r.source}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-slate-500">
            <span className="rounded bg-amber-100 px-1 py-0.5 font-semibold text-amber-700">concept</span> = invented for
            Tyson, grounded in a proven manifestation + a brand with permission · recipes are real emerging dishes pulled
            from free web sources as demand signal, not Tyson products.
          </p>
        </>
      )}
    </div>
  );
}
