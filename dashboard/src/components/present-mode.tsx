"use client";

// Present mode — the Codex dossier as a full-screen, snap-scrolling cinematic deck.
// Every section is a slide; content staggers in as its slide becomes active.
// Esc or ✕ closes; ↑/↓/PgDn (or scroll) move between slides; dots jump.

import { useCallback, useEffect, useRef, useState } from "react";

/* eslint-disable @next/next/no-img-element */

interface Cite { kind: string; report_id?: string; url?: string; label?: string; page?: number }
interface CitedSegment { text: string; cite?: Cite | null }
interface Opportunity {
  name: string; concept: string; why_now?: string;
  tyson_fit?: { category?: string; tier?: string; reason?: string };
}
export interface PresentDossier {
  name: string; tagline: string; definition: string;
  definition_cited?: CitedSegment[]; now: string; now_cited?: CitedSegment[];
  why_it_matters_to_tyson: string;
  key_stats: { stat: string; cite?: Cite }[];
  subtrends: { name: string; description: string; opportunities?: Opportunity[];
    evidence: { level: string; name: string; detail?: string }[] }[];
  horizons: Record<"short" | "medium" | "long", { title: string; detail: string }[]>;
  demand: { summary: string; risers: { term: string; yoy: number }[]; decliners: { term: string; yoy: number }[] };
  tyson_questions: (string | { question: string; cite?: Cite | null })[];
  whitespace: { name: string; note?: string }[];
}

const TIER_BADGE: Record<string, string> = {
  Core: "bg-emerald-400/20 text-emerald-300 ring-1 ring-emerald-400/40",
  Adjacent: "bg-sky-400/20 text-sky-300 ring-1 ring-sky-400/40",
  Stretch: "bg-orange-400/20 text-orange-300 ring-1 ring-orange-400/40",
};

// Hoisted (stable identity) so slides are NOT remounted when the active index changes.
function Stagger({ active, i, children, className }: { active: boolean; i: number; children: React.ReactNode; className?: string }) {
  return (
    <div className={`${className ?? ""} transition-all duration-700 ease-out will-change-transform`}
         style={{ transitionDelay: `${Math.min(i, 8) * 90}ms`,
                  opacity: active ? 1 : 0,
                  transform: active ? "translateY(0)" : "translateY(42px)" }}>
      {children}
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/50">{children}</p>;
}

function Slide({ idx, active, imageSrc, dim = "bg-slate-950/80", children }: {
  idx: number; active: boolean; imageSrc?: string; dim?: string; children: React.ReactNode;
}) {
  return (
    <section data-idx={idx} className="relative flex h-full w-full shrink-0 snap-start snap-always items-center justify-center overflow-hidden">
      {imageSrc && (
        <>
          <img src={imageSrc} alt="" className="absolute inset-0 h-full w-full object-cover"
               style={{ transform: active ? "scale(1.0)" : "scale(1.08)", transition: "transform 1.6s ease-out" }} />
          <div className={`absolute inset-0 ${dim}`} />
        </>
      )}
      <div className="relative max-h-full w-full max-w-6xl overflow-y-auto overscroll-contain px-10 py-14 lg:px-16">{children}</div>
    </section>
  );
}

export function PresentMode({ dossier, imageSrc, rank, total, onClose }: {
  dossier: PresentDossier; imageSrc: string; rank?: number | null; total?: number; onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  activeRef.current = active;

  const subtrends = dossier.subtrends ?? [];
  const slideCount = 3 + subtrends.length + 3;

  const goTo = useCallback((i: number) => {
    const el = containerRef.current?.children[i] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Scroll lock + keyboard + focus (registered once; uses activeRef to avoid re-binding).
  useEffect(() => {
    const prevBody = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Focus the container so wheel events reach it naturally (setting overflow on <html>
    // causes Chrome to swallow wheel events before they reach inner scroll containers).
    containerRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (["ArrowDown", "ArrowRight", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
        goTo(Math.min(activeRef.current + 1, slideCount - 1));
      }
      if (["ArrowUp", "ArrowLeft", "PageUp"].includes(e.key)) {
        e.preventDefault();
        goTo(Math.max(activeRef.current - 1, 0));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevBody;
      window.removeEventListener("keydown", onKey);
    };
  }, [goTo, onClose, slideCount]);

  // Trackpad/wheel navigation — throttled so one swipe = one slide.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let locked = false;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (locked) return;
      locked = true;
      if (e.deltaY > 0) goTo(Math.min(activeRef.current + 1, slideCount - 1));
      else if (e.deltaY < 0) goTo(Math.max(activeRef.current - 1, 0));
      setTimeout(() => { locked = false; }, 800);
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [goTo, slideCount]);

  // Track which slide fills the viewport.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const ob = new IntersectionObserver(
      (entries) => entries.forEach((en) => {
        if (en.isIntersecting) setActive(Number((en.target as HTMLElement).dataset.idx));
      }),
      { root, threshold: 0.55 },
    );
    Array.from(root.children).forEach((c) => ob.observe(c));
    return () => ob.disconnect();
  }, [slideCount]);

  const slides: React.ReactNode[] = [];
  let idx = 0;

  // Cover
  {
    const i = idx++;
    slides.push(
      <Slide key="cover" idx={i} active={active === i} imageSrc={imageSrc}
             dim="bg-gradient-to-t from-slate-950/95 via-slate-950/55 to-slate-950/35">
        <div className="flex min-h-[70vh] flex-col justify-end">
          <Stagger active={active === i} i={0}><Eyebrow>Megatrend Dossier</Eyebrow></Stagger>
          <Stagger active={active === i} i={1}>
            <h1 className="mt-3 max-w-4xl font-display text-6xl font-semibold leading-[1.02] tracking-tight lg:text-7xl">{dossier.name}</h1>
          </Stagger>
          <Stagger active={active === i} i={2}>
            <p className="mt-5 max-w-2xl text-xl font-medium leading-snug text-white/80">{dossier.tagline}</p>
          </Stagger>
          <Stagger active={active === i} i={3}>
            <p className="mt-8 text-[12px] font-bold uppercase tracking-[0.25em] text-white/40">Scroll ↓</p>
          </Stagger>
        </div>
      </Slide>,
    );
  }

  // Now + demand
  {
    const i = idx++;
    slides.push(
      <Slide key="now" idx={i} active={active === i}>
        <div>
          <Stagger active={active === i} i={0}><Eyebrow>01 · The present</Eyebrow></Stagger>
          <Stagger active={active === i} i={1}>
            <h2 className="mt-2 font-display text-4xl font-semibold">What&apos;s happening now</h2>
          </Stagger>
          <Stagger active={active === i} i={2}>
            <p className="mt-6 max-w-3xl text-[17px] leading-[1.8] text-white/85">{dossier.now}</p>
          </Stagger>
          <Stagger active={active === i} i={3} className="mt-8">
            <div className="flex flex-wrap gap-2.5">
              {(dossier.demand?.risers ?? []).slice(0, 8).map((r, k) => (
                <span key={k} className="rounded-full bg-emerald-400/15 px-3.5 py-1.5 text-sm font-bold text-emerald-300 ring-1 ring-emerald-400/30">
                  ▲ {r.term} +{Math.round(r.yoy)}%
                </span>
              ))}
              {(dossier.demand?.decliners ?? []).slice(0, 4).map((r, k) => (
                <span key={k} className="rounded-full bg-rose-400/15 px-3.5 py-1.5 text-sm font-bold text-rose-300 ring-1 ring-rose-400/30">
                  ▼ {r.term} {Math.round(r.yoy)}%
                </span>
              ))}
            </div>
          </Stagger>
        </div>
      </Slide>,
    );
  }

  // Horizons
  {
    const i = idx++;
    slides.push(
      <Slide key="horizons" idx={i} active={active === i}>
        <div>
          <Stagger active={active === i} i={0}><Eyebrow>02 · Where this goes</Eyebrow></Stagger>
          <Stagger active={active === i} i={1}><h2 className="mt-2 font-display text-4xl font-semibold">The horizons</h2></Stagger>
          <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-3">
            {([["Now", "0–12 mo", "border-rose-400/60", dossier.horizons?.short],
               ["Next", "1–3 yr", "border-amber-400/60", dossier.horizons?.medium],
               ["Later", "3+ yr", "border-sky-400/60", dossier.horizons?.long]] as const).map(([t, sub, border, items], col) => (
              <Stagger key={t} active={active === i} i={2 + col}>
                <div className={`h-full rounded-2xl border-t-4 ${border} bg-white/5 p-6 backdrop-blur-sm`}>
                  <div className="flex items-baseline justify-between">
                    <span className="font-display text-2xl font-semibold">{t}</span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">{sub}</span>
                  </div>
                  <ul className="mt-4 space-y-3">
                    {(items ?? []).slice(0, 3).map((h, k) => (
                      <li key={k}>
                        <p className="text-[15px] font-bold text-white/95">{h.title}</p>
                        <p className="mt-0.5 text-[13px] leading-relaxed text-white/60">{h.detail}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </Stagger>
            ))}
          </div>
        </div>
      </Slide>,
    );
  }

  // One slide per subtrend
  subtrends.forEach((s, sIdx) => {
    const i = idx++;
    slides.push(
      <Slide key={`st-${sIdx}`} idx={i} active={active === i}>
        <div>
          <Stagger active={active === i} i={0}>
            <Eyebrow>Subtrend {String(sIdx + 1).padStart(2, "0")} / {String(subtrends.length).padStart(2, "0")}</Eyebrow>
          </Stagger>
          <Stagger active={active === i} i={1}>
            <h2 className="mt-2 max-w-4xl font-display text-4xl font-semibold leading-tight">{s.name}</h2>
          </Stagger>
          <Stagger active={active === i} i={2}>
            <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-white/70">{s.description}</p>
          </Stagger>
          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="space-y-3.5 lg:col-span-3">
              {(s.opportunities ?? []).slice(0, 2).map((o, k) => (
                <Stagger key={k} active={active === i} i={3 + k}>
                  <div className="rounded-2xl bg-white/[0.07] p-5 ring-1 ring-white/15 backdrop-blur-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[17px] font-bold">{o.name}</span>
                      {o.tyson_fit?.tier && (
                        <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TIER_BADGE[o.tyson_fit.tier] ?? TIER_BADGE.Adjacent}`}>
                          {o.tyson_fit.tier}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-[14px] leading-relaxed text-white/75">{o.concept}</p>
                    {o.tyson_fit?.category && (
                      <p className="mt-3 text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/40">🐔 {o.tyson_fit.category}</p>
                    )}
                  </div>
                </Stagger>
              ))}
            </div>
            <Stagger active={active === i} i={5} className="lg:col-span-2">
              <div className="rounded-2xl border border-white/10 p-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">The consumer</p>
                <ul className="mt-3 space-y-2">
                  {(s.evidence ?? []).filter((e) => e.level === "psychographic" || e.level === "behaviour").slice(0, 5).map((e, k) => (
                    <li key={k} className="flex gap-2 text-[13.5px] leading-snug text-white/75">
                      <span className="shrink-0 text-violet-300">•</span>{e.name}
                    </li>
                  ))}
                </ul>
              </div>
            </Stagger>
          </div>
        </div>
      </Slide>,
    );
  });

  // Key stats
  {
    const i = idx++;
    slides.push(
      <Slide key="stats" idx={i} active={active === i}>
        <div>
          <Stagger active={active === i} i={0}><Eyebrow>The evidence</Eyebrow></Stagger>
          <Stagger active={active === i} i={1}><h2 className="mt-2 font-display text-4xl font-semibold">Key statistics</h2></Stagger>
          <div className="mt-8 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {(dossier.key_stats ?? []).slice(0, 10).map((st, k) => (
              <Stagger key={k} active={active === i} i={2 + Math.floor(k / 2)}>
                <div className="rounded-xl border-l-4 border-emerald-400/70 bg-white/[0.06] px-5 py-3.5">
                  <p className="text-[14px] leading-relaxed text-white/85">{st.stat}</p>
                </div>
              </Stagger>
            ))}
          </div>
        </div>
      </Slide>,
    );
  }

  // Tyson layer
  {
    const i = idx++;
    slides.push(
      <Slide key="tyson" idx={i} active={active === i}>
        <div>
          <Stagger active={active === i} i={0}><Eyebrow>From trend to action</Eyebrow></Stagger>
          <Stagger active={active === i} i={1}><h2 className="mt-2 font-display text-4xl font-semibold">The Tyson layer</h2></Stagger>
          <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Stagger active={active === i} i={2}>
              <div className="rounded-2xl border-t-4 border-amber-400/70 bg-white/[0.06] p-6">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">How might Tyson…?</p>
                <ul className="mt-3 space-y-2.5">
                  {(dossier.tyson_questions ?? []).slice(0, 5).map((q, k) => (
                    <li key={k} className="flex gap-2 text-[14px] leading-relaxed text-white/80">
                      <span className="shrink-0 font-extrabold text-amber-300">?</span>
                      {typeof q === "string" ? q : (q as { question: string }).question}
                    </li>
                  ))}
                </ul>
              </div>
            </Stagger>
            <Stagger active={active === i} i={3}>
              <div className="rounded-2xl border-t-4 border-indigo-400/70 bg-white/[0.06] p-6">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-300">White space inside this</p>
                <ul className="mt-3 space-y-2.5">
                  {(dossier.whitespace ?? []).slice(0, 5).map((w, k) => (
                    <li key={k} className="text-[14px] leading-relaxed text-white/80">
                      <span className="font-bold">{w.name}</span>
                      {w.note && <span className="text-white/50">, {w.note}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </Stagger>
          </div>
        </div>
      </Slide>,
    );
  }

  // Outro
  {
    const i = idx++;
    slides.push(
      <Slide key="outro" idx={i} active={active === i} imageSrc={imageSrc} dim="bg-slate-950/85">
        <div className="text-center">
          <Stagger active={active === i} i={0}>
            <p className="font-display text-3xl font-semibold">Every claim in this dossier is cited.</p>
          </Stagger>
          <Stagger active={active === i} i={1}>
            <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-white/60">
              {dossier.why_it_matters_to_tyson}
            </p>
          </Stagger>
          <Stagger active={active === i} i={2}>
            <button onClick={onClose}
                    className="mt-10 rounded-full bg-white px-7 py-3 text-[15px] font-bold text-slate-900 shadow-lg transition hover:scale-105">
              Open the full dossier →
            </button>
          </Stagger>
        </div>
      </Slide>,
    );
  }

  return (
    <div className="fixed inset-0 z-[100] h-screen w-screen bg-slate-950 text-white">
      <button onClick={onClose}
              className="absolute right-5 top-5 z-20 rounded-full bg-white/10 px-4 py-2 text-sm font-bold backdrop-blur transition hover:bg-white/25">
        ✕ Exit
      </button>
      <div className="absolute left-6 top-6 z-20 text-[11px] font-bold uppercase tracking-[0.25em] text-white/40">
        TrendLens · Megatrends
      </div>
      <div className="absolute bottom-5 left-6 z-20 text-[12px] font-bold tabular-nums text-white/40">
        {active + 1} / {slideCount}
      </div>
      <div className="absolute right-5 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-2">
        {Array.from({ length: slideCount }, (_, i) => (
          <button key={i} onClick={() => goTo(i)} aria-label={`Slide ${i + 1}`}
                  className={`h-2 w-2 rounded-full transition-all ${i === active ? "scale-125 bg-white" : "bg-white/25 hover:bg-white/60"}`} />
        ))}
      </div>

      <div ref={containerRef} tabIndex={-1} className="h-full w-full snap-y snap-mandatory overflow-y-auto outline-none">
        {slides}
      </div>
    </div>
  );
}
