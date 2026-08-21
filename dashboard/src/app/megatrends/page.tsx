"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface CodexRow {
  key: string;
  name: string;
  tagline: string | null;
  rank: number | null;
  strength: string | null;
}

interface Strength {
  classes?: number;
  report_count?: number;
  month_count?: number;
  rising_terms?: number;
}

function parseStrength(raw: string | null): Strength {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

const RANK_ACCENT: Record<number, string> = {
  1: "border-l-amber-400",
  2: "border-l-slate-400",
  3: "border-l-orange-300",
};

const HERO_IMAGES = [
  "protein", "value", "flavor", "social", "functional",
  "cleanlabel", "convenience", "conscious", "blur", "glp1",
];

export default function MegatrendsPage() {
  const [rows, setRows]       = useState<CodexRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/codex")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d.megatrends)) setRows(d.megatrends); })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Hero — full-bleed image mosaic ────────────────────────────── */}
      <div className="relative h-[420px] overflow-hidden">

        {/* 10-image mosaic strip */}
        <div className="absolute inset-0 flex">
          {HERO_IMAGES.map((key) => (
            <div key={key} className="relative flex-1 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/megatrends/${key}.png`}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
          ))}
        </div>

        {/* Layered overlays for depth + text legibility */}
        <div className="absolute inset-0 bg-slate-950/75" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-slate-950/40" />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/60 via-transparent to-slate-950/60" />

        {/* Thin seam lines between columns for texture */}
        <div className="pointer-events-none absolute inset-0 flex">
          {HERO_IMAGES.map((key) => (
            <div key={key} className="flex-1 border-r border-white/5 last:border-r-0" />
          ))}
        </div>

        {/* Text content */}
        <div className="relative flex h-full flex-col items-center justify-center px-6 text-center text-white">
          <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.28em] text-emerald-400">
            Megatrend Codex · {HERO_IMAGES.length} Canonical Forces
          </p>
          <h1 className="font-display text-5xl font-semibold tracking-tight lg:text-6xl">
            The Trends Shaping<br />What People Eat
          </h1>
          <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-slate-300">
            Synthesized from agencies, Mintel, Hartman Group, and Tyson&apos;s own digests.
            Ranked by evidence strength — click any to open its full dossier.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-2 text-[12px]">
            <span className="rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 font-medium text-white/80 backdrop-blur-sm">
              📄 Source-grounded
            </span>
            <span className="rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 font-medium text-white/80 backdrop-blur-sm">
              📈 Demand-measured
            </span>
            <span className="rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 font-medium text-white/80 backdrop-blur-sm">
              🔗 Fully cited
            </span>
          </div>
        </div>

        {/* Bottom fade into page bg */}
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-slate-50 to-transparent" />
      </div>

      {/* ── List ──────────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-4xl px-6 py-10">
        {loading ? (
          <div className="py-24 text-center text-slate-400">Loading dossiers…</div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-16 text-center shadow-sm">
            <p className="text-slate-400">No megatrend dossiers yet. Run the Codex pipeline to generate them.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((row, i) => {
              const rank     = row.rank ?? i + 1;
              const strength = parseStrength(row.strength);
              const accentCls = RANK_ACCENT[rank] ?? "border-l-slate-200";

              return (
                <Link key={row.key} href={`/best?key=${row.key}`}>
                  <div className={`group flex cursor-pointer items-center gap-5 rounded-2xl border border-slate-100 border-l-4 ${accentCls} bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-200 hover:shadow-xl`}>

                    {/* Rank */}
                    <div className="w-12 shrink-0 text-center">
                      <span className="font-display text-4xl font-black tabular-nums text-slate-100 transition-colors group-hover:text-slate-200">
                        {String(rank).padStart(2, "0")}
                      </span>
                    </div>

                    {/* Image */}
                    <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl shadow-md">
                      <img
                        src={`/megatrends/${row.key}.png`}
                        alt={row.name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-bold leading-snug text-slate-900 group-hover:text-emerald-700 transition-colors">
                        {row.name}
                      </h2>
                      {row.tagline && (
                        <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-slate-500">
                          {row.tagline}
                        </p>
                      )}
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {(strength.report_count ?? 0) > 0 && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                            {strength.report_count} reports
                          </span>
                        )}
                        {(strength.rising_terms ?? 0) > 0 && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                            ↑ {strength.rising_terms} rising
                          </span>
                        )}
                        {(strength.month_count ?? 0) > 0 && (
                          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-600">
                            {strength.month_count}mo tracked
                          </span>
                        )}
                        {(strength.classes ?? 0) > 0 && (
                          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-600">
                            {strength.classes} evidence types
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Arrow */}
                    <div className="shrink-0 text-[22px] text-slate-200 transition-all duration-200 group-hover:translate-x-1 group-hover:text-emerald-500">
                      →
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
