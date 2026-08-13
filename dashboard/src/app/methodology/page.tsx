"use client";

import { useEffect, useState } from "react";

interface SourceStat { tag: string; reports: number; nodes: number | null; last_upload: string | null }
interface Stats {
  sources: SourceStat[];
  measures: { measured_terms: number; rising: number; with_data: number };
  synthesis: { dossiers: number; web_finds: number; map_nodes: number; lab_ideas: number; tyson_skus: number };
}

const SOURCE_META: Record<string, { name: string; desc: string; color: string; badge: string; icon: string }> = {
  deck: {
    name: "Agency & Industry Decks",
    desc: "Trend reports from agencies and industry bodies (PDF/PPTX), uploaded by the team. Covers consumer culture, innovation forecasts, and category outlooks.",
    color: "border-slate-300 bg-slate-50",
    badge: "bg-slate-200 text-slate-700",
    icon: "▣",
  },
  mintel: {
    name: "Mintel",
    desc: "Syndicated consumer-research reports with large-sample survey statistics from Mintel's client portal. Provides quantified evidence behind behavioural trends.",
    color: "border-sky-200 bg-sky-50",
    badge: "bg-sky-100 text-sky-700",
    icon: "📚",
  },
  tyson: {
    name: "Tyson Internal Digests",
    desc: "Tyson's own monthly trend digests — insight cards tracked across months for persistence scoring. The only proprietary source in the system.",
    color: "border-emerald-200 bg-emerald-50",
    badge: "bg-emerald-100 text-emerald-700",
    icon: "🐔",
  },
  hartman: {
    name: "Hartman Group",
    desc: "Occasion-level consumer research: who eats what, when, why. Complements Mintel's category view with anthropological eating-occasion depth.",
    color: "border-orange-200 bg-orange-50",
    badge: "bg-orange-100 text-orange-700",
    icon: "🍽️",
  },
};

const DOSSIER_SECTIONS = [
  { icon: "📌", title: "Definition", desc: "A plain-language statement of what the megatrend is and why it matters for food and protein." },
  { icon: "📊", title: "Strength Scorecard", desc: "Four transparent scores: evidence classes, report count, persistence (months in internal digests), and rising search terms." },
  { icon: "🔎", title: "What's Happening Now", desc: "Synthesized narrative of current market signals — what's been observed, what it means, what's still emerging." },
  { icon: "⏱️", title: "Now / Next / Later Horizons", desc: "Three time bands with rationale: today's consumer behaviour, the 12-24 month signal, and the 3–5 year structural shift." },
  { icon: "📈", title: "Key Stats", desc: "Cited quantitative claims extracted from source reports — survey numbers, penetration data, growth rates — each linked to its original document and page." },
  { icon: "🔍", title: "Measured Demand", desc: "Google Trends search-interest series for the trend's top terms, classified as rising, durable, or fading." },
  { icon: "🌿", title: "Merged Subtrends", desc: "All subtrends from across every source document that belong to this canonical megatrend, deduplicated and attributed." },
  { icon: "🐔", title: "Tyson Layer", desc: "Question bank, product concepts, and white-space opportunities — anchored to Tyson's real SKU catalog across 26 categories." },
  { icon: "📑", title: "Bibliography", desc: "Every source document used in the dossier, with clickable links to open the original file at the cited page." },
];

const STEPS = [
  {
    n: 1,
    title: "Ingest",
    subtitle: "Expert sources, unmodified",
    color: "bg-violet-600",
    ring: "ring-violet-200",
    accent: "text-violet-600",
    bg: "bg-violet-50 border-violet-100",
  },
  {
    n: 2,
    title: "Extract",
    subtitle: "One consistent trend grammar",
    color: "bg-sky-600",
    ring: "ring-sky-200",
    accent: "text-sky-600",
    bg: "bg-sky-50 border-sky-100",
  },
  {
    n: 3,
    title: "Validate",
    subtitle: "Measured demand, not opinion",
    color: "bg-emerald-600",
    ring: "ring-emerald-200",
    accent: "text-emerald-600",
    bg: "bg-emerald-50 border-emerald-100",
  },
  {
    n: 4,
    title: "Corroborate",
    subtitle: "The open web as a second witness",
    color: "bg-amber-500",
    ring: "ring-amber-200",
    accent: "text-amber-600",
    bg: "bg-amber-50 border-amber-100",
  },
  {
    n: 5,
    title: "Synthesize",
    subtitle: "Megatrends",
    color: "bg-rose-600",
    ring: "ring-rose-200",
    accent: "text-rose-600",
    bg: "bg-rose-50 border-rose-100",
  },
  {
    n: 6,
    title: "Cite",
    subtitle: "Every claim is checkable",
    color: "bg-slate-700",
    ring: "ring-slate-200",
    accent: "text-slate-700",
    bg: "bg-slate-50 border-slate-200",
  },
];

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function StatTile({ value, label, sub }: { value: string | number; label: string; sub?: string }) {
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="text-3xl font-extrabold tracking-tight text-slate-900">{typeof value === "number" ? value.toLocaleString() : value}</div>
      <div className="mt-0.5 text-[13px] font-semibold text-slate-700">{label}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

export default function MethodologyPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/methodology").then((r) => r.json()).then((d) => { if (d.sources) setStats(d); }).catch(() => {});
  }, []);

  const totalReports = stats?.sources.reduce((s, r) => s + r.reports, 0) ?? null;
  const totalNodes = stats?.sources.reduce((s, r) => s + (r.nodes ?? 0), 0) ?? null;

  return (
    <div className="mx-auto max-w-5xl space-y-12 p-6 pb-16 lg:p-10">

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8 text-white shadow-xl ring-1 ring-white/10 lg:p-10">
        <div className="max-w-3xl">
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-400">How it works</div>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight lg:text-5xl">TrendLens Methodology</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-slate-300">
            A six-stage pipeline that turns raw source documents into fully cited, demand-validated trend intelligence.
            Nothing on this platform is invented — every trend is extracted from a named source and every demand
            claim is measured against real Google search behaviour.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2 text-[13px] font-medium text-slate-400">
            <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1">📄 Source-grounded</span>
            <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1">📈 Demand-measured</span>
            <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1">🔗 Fully cited</span>
            <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1">🔄 Cross-corroborated</span>
          </div>
        </div>

        {/* Live stat tiles */}
        {stats && (
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile value={totalReports ?? "—"} label="Source reports" sub="across 4 providers" />
            <StatTile value={totalNodes ?? "—"} label="Extracted items" sub="products, trends, behaviours" />
            <StatTile value={stats.measures.measured_terms} label="Terms measured" sub="via Google Trends" />
            <StatTile value={stats.synthesis.dossiers} label="Megatrend dossiers" sub="canonical megatrends" />
          </div>
        )}
      </div>

      {/* ── Pipeline ─────────────────────────────────────────────────── */}
      <div>
        <div className="mb-6">
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">The pipeline</div>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">Six stages from source to insight</h2>
        </div>

        <div className="relative space-y-0">
          {/* vertical connector line */}
          <div className="absolute left-[19px] top-10 h-[calc(100%-5rem)] w-0.5 bg-slate-200" />

          {/* Step 1 */}
          <StepCard step={STEPS[0]}>
            <p>
              The system ingests trend reports exactly as published — agency decks, Mintel research, Hartman Group
              occasion studies and Tyson&apos;s own monthly digests. Files are stored unmodified; every claim extracted
              later keeps a direct link back to the original document and, where possible, the exact page number.
            </p>
            <div className="mt-2 text-[13.5px] font-semibold text-slate-700">Supported formats:</div>
            <ul className="mt-1 grid grid-cols-2 gap-x-6 gap-y-1 text-[13px] text-slate-600 sm:grid-cols-4">
              <li className="flex items-center gap-1.5"><span className="text-violet-500">▪</span> PDF reports</li>
              <li className="flex items-center gap-1.5"><span className="text-violet-500">▪</span> PowerPoint decks</li>
              <li className="flex items-center gap-1.5"><span className="text-violet-500">▪</span> Internal digests</li>
              <li className="flex items-center gap-1.5"><span className="text-violet-500">▪</span> Syndicated research</li>
            </ul>
            {stats && (
              <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-left text-[13px]">
                  <thead className="border-b border-slate-100 bg-slate-50 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Source</th>
                      <th className="px-4 py-3">Reports</th>
                      <th className="px-4 py-3">Items extracted</th>
                      <th className="px-4 py-3 hidden sm:table-cell">Last updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stats.sources.map((s) => {
                      const meta = SOURCE_META[s.tag] ?? { name: s.tag, desc: "", badge: "bg-slate-100 text-slate-600", icon: "▣", color: "", };
                      return (
                        <tr key={s.tag} className="bg-white hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-base">{meta.icon}</span>
                              <div>
                                <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${meta.badge}`}>{meta.name}</span>
                                <div className="mt-1 hidden max-w-xs text-[11.5px] leading-snug text-slate-400 sm:block">{meta.desc}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-bold text-slate-800">{s.reports}</td>
                          <td className="px-4 py-3 text-slate-600">{s.nodes?.toLocaleString() ?? "—"}</td>
                          <td className="hidden px-4 py-3 text-slate-500 sm:table-cell">{fmtDate(s.last_upload)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-2 text-[12.5px] text-slate-500">
              Re-uploading a file updates its report in place (matched by filename) — no duplicates accumulate.
              Each file gets a permanent report ID used to deep-link back to the original at any citation.
            </p>
          </StepCard>

          {/* Step 2 */}
          <StepCard step={STEPS[1]}>
            <p>
              AI (Claude Opus 4.8) reads each document and decomposes it into a single shared taxonomy.
              The grammar is the same regardless of the source: every report becomes a tree of
              <span className="font-bold"> megatrends → subtrends → evidence nodes</span>.
            </p>
            <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50 p-4">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-sky-500">Taxonomy structure</div>
              <div className="space-y-1.5 text-[13px]">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 rounded bg-sky-200 px-1.5 py-0.5 text-[10px] font-extrabold text-sky-800">MEGATREND</span>
                  <span className="text-slate-600">Top-level force, e.g. "Health Redefined for Prepared Meals"</span>
                </div>
                <div className="ml-4 flex items-start gap-2">
                  <span className="mt-0.5 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-extrabold text-sky-700">SUBTREND</span>
                  <span className="text-slate-600">A specific manifestation, e.g. "GLP-1 Edge" or "Gut Instincts"</span>
                </div>
                <div className="ml-8 grid grid-cols-2 gap-1 sm:grid-cols-4">
                  {[["🍗","Products & formats"],["🌿","Ingredients"],["👤","Behaviours"],["💭","Values & mindsets"]].map(([icon, label]) => (
                    <div key={label} className="flex items-center gap-1.5 rounded-lg bg-white px-2 py-1.5 text-[11.5px] font-medium text-slate-600 ring-1 ring-slate-200">
                      <span>{icon}</span>{label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <p className="mt-2 text-[13px] text-slate-600">
              Extraction is strictly grounded: only claims the source document actually makes are captured.
              The report&apos;s own framing and terminology are preserved. Because every source uses the same grammar,
              a Mintel survey and a Hartman ethnography become directly comparable.
            </p>
            {totalNodes && (
              <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-sky-100 px-3 py-1.5 text-[13px] font-bold text-sky-700">
                {totalNodes.toLocaleString()} total items extracted across all sources
              </div>
            )}
          </StepCard>

          {/* Step 3 */}
          <StepCard step={STEPS[2]}>
            <p>
              Every extracted product and ingredient gets a normalised search term. The system then measures
              real Google search interest using a Playwright real-browser scraper (no API key needed — results
              match what a consumer actually sees). Weekly series are pulled for the US market.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {[
                { label: "Rising", desc: "Year-over-year search growth", cls: "bg-emerald-100 border-emerald-200 text-emerald-800" },
                { label: "Durable", desc: "Rising + low volatility — sustained, not a spike", cls: "bg-teal-100 border-teal-200 text-teal-800" },
                { label: "Fading", desc: "Declining or flat interest over 12 months", cls: "bg-slate-100 border-slate-200 text-slate-600" },
              ].map(({ label, desc, cls }) => (
                <div key={label} className={`rounded-xl border px-4 py-3 ${cls}`}>
                  <div className="font-extrabold">{label}</div>
                  <div className="mt-0.5 text-[12px] leading-snug">{desc}</div>
                </div>
              ))}
            </div>
            {stats && (
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-[13px] font-bold text-slate-700">
                  {stats.measures.measured_terms.toLocaleString()} terms measured
                </span>
                <span className="rounded-lg bg-emerald-100 px-3 py-1.5 text-[13px] font-bold text-emerald-700">
                  {stats.measures.rising.toLocaleString()} currently rising ↑
                </span>
              </div>
            )}
            <p className="mt-2 text-[12.5px] text-slate-500">
              Google Trends values are relative interest (0–100) within the measured period — best read
              as momentum signals, not absolute market size. Durable classifications filter out viral spikes.
            </p>
          </StepCard>

          {/* Step 4 */}
          <StepCard step={STEPS[3]}>
            <p>
              Independently of the paid reports, TrendLens harvests the open internet — trade press (Food Business
              News, Nation&apos;s Restaurant News), food media, retailer launch activity — into its own bottom-up
              trend map. This is built from scratch, without knowledge of what the decks say.
            </p>
            <p className="mt-2">
              The two streams are then compared. A trend that appears in both an agency deck <em>and</em> the organic
              web harvest is stronger than a trend only one source mentions. Single-source signals are preserved
              but marked as thin evidence — never amplified into the synthesis.
            </p>
            <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 p-4 text-[13px]">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-amber-600">Corroboration logic</div>
              <div className="space-y-1 text-slate-700">
                <div className="flex items-center gap-2"><span className="text-amber-500 font-bold">2+</span> independent sources → strong evidence, enters synthesis</div>
                <div className="flex items-center gap-2"><span className="text-amber-400 font-bold">1</span> source only → preserved, flagged as thin evidence</div>
                <div className="flex items-center gap-2"><span className="text-emerald-600 font-bold">Web + deck</span> → overlap tracked and shown on Trend Map</div>
              </div>
            </div>
            {stats && (
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-[13px] font-bold text-slate-700">
                  {stats.synthesis.web_finds.toLocaleString()} web discoveries
                </span>
                <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-[13px] font-bold text-slate-700">
                  {stats.synthesis.map_nodes.toLocaleString()} bottom-up map nodes
                </span>
              </div>
            )}
          </StepCard>

          {/* Step 5 */}
          <StepCard step={STEPS[4]}>
            <p>
              All extracted trends — across every report, web harvest, and internal digest — are clustered into
              ten canonical megatrends. Each gets one deeply detailed dossier that combines every source touching it.
            </p>
            <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50 p-4 text-[13px]">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-rose-500">Strength scorecard — 4 dimensions</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  ["Evidence classes","How many independent kinds of proof: product, ingredient, behaviour, value"],
                  ["Report count","How many distinct documents corroborate the trend"],
                  ["Persistence","Months the trend appears in Tyson's internal digests"],
                  ["Measured demand","Number of search terms classified rising or durable"],
                ].map(([title, desc]) => (
                  <div key={title} className="rounded-lg bg-white px-3 py-2 ring-1 ring-rose-100">
                    <div className="font-semibold text-slate-800">{title}</div>
                    <div className="mt-0.5 text-[11.5px] leading-snug text-slate-500">{desc}</div>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-2 text-[13px] text-slate-600">
              The Tyson layer is generated against Tyson&apos;s real product catalog
              {stats ? ` (${stats.synthesis.tyson_skus.toLocaleString()} SKUs across 26 categories)` : ""} — so
              every white-space opportunity and concept is anchored to a category the company can actually build in.
            </p>
            {stats && (
              <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-rose-100 px-3 py-1.5 text-[13px] font-bold text-rose-700">
                {stats.synthesis.dossiers} Megatrend dossiers published
              </div>
            )}
          </StepCard>

          {/* Step 6 */}
          <StepCard step={STEPS[5]}>
            <p>
              Every synthesised statement carries a citation. No claim ships without a traceable source.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 font-bold text-slate-800"><span className="text-base">📄</span> Internal citations</div>
                <div className="mt-1 text-[12.5px] leading-snug text-slate-500">
                  Open the original source document at the exact cited page via the built-in PDF viewer.
                  Deep-linked as <code className="rounded bg-slate-100 px-1 text-[11px]">/api/file/[id]#page=N</code>.
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 font-bold text-slate-800"><span className="text-base">↗</span> External citations</div>
                <div className="mt-1 text-[12.5px] leading-snug text-slate-500">
                  Open the original website or trade press article in a new tab.
                  URLs are preserved from the web harvest verbatim.
                </div>
              </div>
            </div>
            <p className="mt-3 text-[13px] text-slate-600">
              Each dossier ends with a full bibliography listing every document used — sortable by source type.
              If a claim can&apos;t be traced, it doesn&apos;t ship.
            </p>
          </StepCard>
        </div>
      </div>

      {/* ── What's in a dossier ──────────────────────────────────────── */}
      <div>
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">The output</div>
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">What&apos;s inside a Megatrend dossier</h2>
        <p className="mt-1 text-[14px] text-slate-500">Each of the ten canonical megatrends gets all of the following, fully cited.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DOSSIER_SECTIONS.map(({ icon, title, desc }) => (
            <div key={title} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 font-bold text-slate-800">
                <span className="text-lg">{icon}</span> {title}
              </div>
              <div className="mt-1.5 text-[12.5px] leading-snug text-slate-500">{desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Trust principles ─────────────────────────────────────────── */}
      <div className="rounded-3xl bg-slate-900 p-8 text-white ring-1 ring-white/10">
        <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-400">Our commitments</div>
        <h2 className="mt-1 text-2xl font-extrabold tracking-tight">The rules the system holds itself to</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {[
            ["Grounded extraction", "Nothing is added that a source document doesn't explicitly state. No embellishment, no inference beyond what's written."],
            ["Measured demand", "Demand claims come from Google Trends data, not from what a report says. Search interest is measured, not asserted."],
            ["Full traceability", "Every claim links to its original document at the exact page, or to the URL it was harvested from."],
            ["Thin-evidence honesty", "Single-source trends are preserved but clearly marked. They are never amplified into synthesis."],
            ["Unmodified originals", "Source files are stored exactly as received and are always openable from citations."],
            ["Transparent scoring", "Strength scores are computed from objective counts — evidence classes, report counts, months seen — not editorial judgment."],
            ["No brand inflation", "Tyson product opportunities are anchored to the real SKU catalog. Whitespace claims only land where there's actual portfolio capacity."],
            ["No stale synthesis", "After any new report is ingested, the Megatrend dossiers are rebuilt to incorporate it — the system doesn't drift from its source material."],
          ].map(([title, desc]) => (
            <div key={title} className="flex gap-3 rounded-xl bg-white/5 px-4 py-3">
              <span className="mt-0.5 shrink-0 font-extrabold text-emerald-400">✓</span>
              <div>
                <div className="font-semibold text-white">{title}</div>
                <div className="mt-0.5 text-[12.5px] leading-snug text-slate-400">{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StepCard({ step, children }: { step: typeof STEPS[0]; children: React.ReactNode }) {
  return (
    <div className="relative flex gap-5 pb-8">
      {/* number badge + line */}
      <div className="flex flex-col items-center">
        <div className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${step.color} ring-4 ${step.ring} text-[15px] font-extrabold text-white shadow-md`}>
          {step.n}
        </div>
      </div>
      {/* card */}
      <div className="flex-1 pb-2">
        <div className={`rounded-2xl border ${step.bg} p-5 shadow-sm`}>
          <div className="flex items-baseline gap-2">
            <h3 className={`text-lg font-extrabold tracking-tight ${step.accent}`}>{step.title}</h3>
            <span className="text-[13px] font-semibold text-slate-500">— {step.subtitle}</span>
          </div>
          <div className="mt-3 space-y-2 text-[13.5px] leading-relaxed text-slate-700">{children}</div>
        </div>
      </div>
    </div>
  );
}
