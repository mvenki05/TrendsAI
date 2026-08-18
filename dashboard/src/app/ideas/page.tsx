"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";

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
              {tier ? `${tier}: Tyson permission to play` : "Tyson fit"}
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
            <div>Rides the manifestation <span className="font-medium text-indigo-700">"{i.evidence_manifestation || i.rides_subtrend}"</span>, which sits under this megatrend.</div>
            {i.validation_reason && <div><span className="font-semibold">Validation:</span> {i.validation_reason}.</div>}
            {evSources.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {evSources.map((s, k) => (
                  <li key={k} className="truncate text-[10px] text-slate-500" title={s.title}>
                    · {s.url
                        ? <a href={s.url} target="_blank" rel="noreferrer" className="text-sky-700 underline decoration-sky-300 hover:decoration-sky-600">{s.title}</a>
                        : s.title}
                    {s.source && <span className="text-slate-400"> · {s.source}</span>}
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
  order.sort((a, b) => byMega.get(b)!.ideas.length - byMega.get(a)!.ideas.length || a.localeCompare(b));

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
    <div>
      <PageHeader
        title="Innovation Ideas"
        description="Grounded product concepts, each invented from a proven megatrend and a Tyson brand with permission to play. Alongside them, emerging real-world dishes as demand signal."
        img="/subtrends/protein-0.png"
        badge="Product Innovation"
        stats={ideas.length > 0 ? [
          { value: byMega.size, label: "megatrends" },
          { value: ideas.length, label: "Tyson concepts" },
          { value: recipes.length, label: "emerging recipes" },
        ] : undefined}
      />

      <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
        {loading ? (
          <div className="py-16 text-center text-slate-400">Loading…</div>
        ) : ideas.length === 0 && recipes.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-16 text-center shadow-[0_4px_24px_rgba(0,0,0,0.07)]">
            <p className="text-slate-400">No innovation ideas yet.</p>
          </div>
        ) : (
          <>
            {/* Legend */}
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_4px_24px_rgba(0,0,0,0.07)]">
              <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">How to read the badges</div>
              <div className="flex flex-wrap gap-x-10 gap-y-3 text-[11px]">
                <div>
                  <div className="mb-1.5 font-semibold text-slate-700">Permission to play</div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5"><span className="rounded bg-emerald-100 px-1.5 py-0.5 font-bold text-emerald-700">✓ Core</span><span className="text-slate-500">Tyson already owns this space, direct fit.</span></div>
                    <div className="flex items-center gap-1.5"><span className="rounded bg-sky-100 px-1.5 py-0.5 font-bold text-sky-700">◆ Adjacent</span><span className="text-slate-500">Natural stretch, brand permission is clear.</span></div>
                    <div className="flex items-center gap-1.5"><span className="rounded bg-orange-100 px-1.5 py-0.5 font-bold text-orange-700">⚑ Stretch</span><span className="text-slate-500">New territory: higher risk, higher upside.</span></div>
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 font-semibold text-slate-700">Validation</div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5"><span className="rounded bg-emerald-600 px-1.5 py-0.5 font-bold text-white">Strong</span><span className="text-slate-500">Multiple signals confirm established growth.</span></div>
                    <div className="flex items-center gap-1.5"><span className="rounded bg-amber-400 px-1.5 py-0.5 font-bold text-amber-950">Moderate</span><span className="text-slate-500">Emerging across 1–2 sources.</span></div>
                    <div className="flex items-center gap-1.5"><span className="rounded bg-slate-300 px-1.5 py-0.5 font-bold text-slate-700">Early</span><span className="text-slate-500">Nascent. Worth watching.</span></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.07)]">
              <h2 className="font-display mb-4 text-xl font-semibold text-slate-900">Concepts by Megatrend</h2>
              <div className="space-y-2">
                {order.map((mega) => {
                  const bucket = byMega.get(mega)!;
                  const open = openMega.has(mega);
                  return (
                    <div key={mega} className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50 transition-shadow hover:shadow-md">
                      <button onClick={() => toggle(mega)}
                        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-slate-100/60">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className={`text-xs text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
                          <span className="truncate font-semibold text-slate-900">{mega}</span>
                        </span>
                        <span className="shrink-0 text-xs text-amber-600">{bucket.ideas.length} concepts</span>
                      </button>
                      {open && (
                        <div className="border-t border-slate-100 bg-white px-5 py-4">
                          {bucket.desc && <p className="mb-4 text-sm leading-relaxed text-slate-600">{bucket.desc}</p>}
                          {bucket.ideas.length > 0 && (
                            <div>
                              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-600">💡 Tyson concepts ({bucket.ideas.length})</div>
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
            </div>

            {recipes.length > 0 && (
              <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.07)]">
                <div className="mb-1 flex items-baseline gap-2">
                  <h2 className="font-display text-xl font-semibold text-slate-900">🍳 Emerging recipes in the wild</h2>
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700">{recipes.length}</span>
                </div>
                <p className="mt-1 max-w-2xl text-sm text-slate-500">Real dishes people are cooking right now: demand signal and inspiration grouped by megatrend.</p>
                <div className="mt-4 space-y-4">
                  {recipeOrder.map((mega) => (
                    <div key={mega}>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{mega} <span className="text-slate-300">({recipesByMega.get(mega)!.length})</span></div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {recipesByMega.get(mega)!.map((r) => (
                          <div key={r.recipe_id} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-sm">
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

            <p className="text-xs text-slate-400">
              <span className="rounded bg-amber-100 px-1 py-0.5 font-semibold text-amber-700">concept</span> = invented for Tyson, grounded in a proven manifestation + a brand with permission · recipes are real emerging dishes as demand signal.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
