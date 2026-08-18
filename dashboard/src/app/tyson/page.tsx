"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";

interface Theme {
  theme_id: string;
  name: string;
  description: string | null;
  card_count: number | null;
  month_count: number | null;
  months: string | null;
  source_kinds: string | null;
  key_stats: string | null;
  combined_implication: string | null;
  tyson_questions: string | null;
}

interface Card {
  card_id: string;
  report_id: string;
  source_kind: string | null;
  month: string | null;
  learning: string | null;
  implication: string | null;
  recommendations: string | null;
  questions: string | null;
  theme: string | null;
  filename: string;
}

const ACCENT = [
  "bg-emerald-500", "bg-orange-500", "bg-sky-500", "bg-amber-500",
  "bg-teal-500", "bg-purple-500", "bg-indigo-500", "bg-cyan-500",
];

const SOURCE_STYLE: Record<string, string> = {
  hartman: "bg-amber-100 text-amber-700",
  mintel: "bg-sky-100 text-sky-700",
  bites: "bg-emerald-100 text-emerald-700",
  social: "bg-violet-100 text-violet-700",
};

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

export default function TysonInsightsPage() {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/insights")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.themes)) setThemes(d.themes);
        if (Array.isArray(d.cards)) setCards(d.cards);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  function toggle(id: string) {
    setOpen((prev) => {
      const s = new Set(prev);
      if (s.has(id)) { s.delete(id); } else { s.add(id); }
      return s;
    });
  }

  const totalQuestions = themes.reduce((a, t) => a + parseList(t.tyson_questions).length, 0);

  return (
    <div>
      <PageHeader
        title="Tyson Bites: Combined Insights"
        description="One synthesized view across all monthly digests. Insights are clustered into themes by persistence and corroboration, with every survey stat and Tyson question bank preserved."
        img="/subtrends/protein-1.png"
        badge="Proprietary Intelligence"
        stats={themes.length > 0 ? [
          { value: themes.length, label: "combined themes" },
          { value: cards.length, label: "insight cards" },
          { value: totalQuestions, label: "Tyson questions" },
        ] : undefined}
      />

      <div className="mx-auto max-w-7xl space-y-5 p-6 lg:p-8">
      {loading ? (
        <div className="py-16 text-center text-slate-400">Loading…</div>
      ) : themes.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-16 text-center shadow-[0_4px_24px_rgba(0,0,0,0.07)]">
          <p className="text-slate-400">No combined insights yet. Cards are extracted but themes haven&apos;t been clustered.</p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {themes.map((t, i) => {
              const months = parseList(t.months);
              const sources = parseList(t.source_kinds);
              const stats = parseList(t.key_stats);
              const questions = parseList(t.tyson_questions);
              const members = cards.filter((c) => c.theme === t.name);
              const isOpen = open.has(t.theme_id);
              const accent = ACCENT[i % ACCENT.length];
              return (
                <div key={t.theme_id} className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-[0_4px_24px_rgba(0,0,0,0.07)]">
                  <div className="px-6 pt-5 pb-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${accent}`} />
                        <h2 className="font-display text-lg font-semibold leading-snug text-slate-900">{t.name}</h2>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-700"
                              title="How many of the 7 months this theme appeared in — persistence is the signal">
                          {t.month_count} of 7 months
                        </span>
                        {sources.map((s) => (
                          <span key={s} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${SOURCE_STYLE[s] ?? "bg-slate-100 text-slate-600"}`}>
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                    {t.description && (
                      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-500">{t.description}</p>
                    )}
                    {t.combined_implication && (
                      <p className="mt-2 max-w-3xl rounded-lg bg-slate-50 px-3 py-2 text-[13px] leading-relaxed text-slate-700">
                        <span className="font-bold uppercase tracking-wide text-slate-400 text-[10px]">So what: </span>
                        {t.combined_implication}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-0 border-t border-slate-100 lg:grid-cols-2">
                    <div className="border-b border-slate-100 p-5 lg:border-b-0 lg:border-r">
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-emerald-600">The evidence (survey data)</p>
                      {stats.length === 0 ? (
                        <p className="text-xs text-slate-400">No quantified stats in this theme.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {stats.map((s, k) => (
                            <li key={k} className="flex gap-2 text-[12px] leading-relaxed text-slate-600">
                              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />{s}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="p-5">
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-amber-500">Now what: The Tyson question bank</p>
                      {questions.length === 0 ? (
                        <p className="text-xs text-slate-400">No strategic questions captured for this theme.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {questions.map((q, k) => (
                            <li key={k} className="flex gap-2 text-[12px] leading-relaxed text-slate-700">
                              <span className="mt-[2px] shrink-0 font-bold text-amber-500">?</span>{q}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {members.length > 0 && (
                    <div className="border-t border-slate-100 px-6 py-3">
                      <button onClick={() => toggle(t.theme_id)}
                              className="text-xs font-semibold text-slate-500 hover:text-slate-700">
                        {isOpen ? "Hide" : "Show"} {members.length} source cards ({months.join(", ")})
                      </button>
                      {isOpen && (
                        <div className="mt-3 space-y-2">
                          {members.map((c) => (
                            <div key={c.card_id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                              <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                                {c.month && <span className="rounded bg-slate-200 px-1.5 py-0.5 font-bold text-slate-600">{c.month}</span>}
                                {c.source_kind && (
                                  <span className={`rounded px-1.5 py-0.5 font-semibold ${SOURCE_STYLE[c.source_kind] ?? "bg-slate-100 text-slate-600"}`}>
                                    {c.source_kind}
                                  </span>
                                )}
                              </div>
                              {c.learning && <div className="mt-1 text-[12px] leading-relaxed text-slate-700">{c.learning}</div>}
                              {c.implication && (
                                <div className="mt-1 text-[11px] leading-relaxed text-slate-500">
                                  <span className="font-semibold">So what: </span>{c.implication}
                                </div>
                              )}
                              {parseList(c.recommendations).length > 0 && (
                                <ul className="mt-1 space-y-0.5">
                                  {parseList(c.recommendations).map((r, k) => (
                                    <li key={k} className="text-[11px] leading-relaxed text-slate-600">→ {r}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-xs text-slate-500">
            Themes ranked by persistence (months seen), then evidence volume · sources: hartman = Hartman Group,
            mintel = Mintel Quick Insights, bites = Bites Summary, social = social-media edition.
          </p>
        </>
      )}
      </div>
    </div>
  );
}
