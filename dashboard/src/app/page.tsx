"use client";
import { apiUrl, assetUrl, HOSTED } from "@/lib/api";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";

interface HomeStats {
  reports: number;
  megatrends: number;
  webFinds: number;
  labIdeas: number;
}

interface CodexChip {
  key: string;
  name: string;
  tagline: string | null;
}

// Every hero/megatrend/subtrend image already used elsewhere in the app — one big slideshow.
const HERO_SLIDES = [
  "/hero.webp",
  "/megatrends/blur.webp",
  "/megatrends/cleanlabel.webp",
  "/megatrends/conscious.webp",
  "/megatrends/convenience.webp",
  "/megatrends/flavor.webp",
  "/megatrends/functional.webp",
  "/megatrends/glp1.webp",
  "/megatrends/protein.webp",
  "/megatrends/social.webp",
  "/megatrends/value.webp",
  "/subtrends/blur-0.webp",
  "/subtrends/blur-1.webp",
  "/subtrends/blur-2.webp",
  "/subtrends/blur-3.webp",
  "/subtrends/blur-4.webp",
  "/subtrends/blur-5.webp",
  "/subtrends/blur-6.webp",
  "/subtrends/cleanlabel-0.webp",
  "/subtrends/cleanlabel-1.webp",
  "/subtrends/cleanlabel-2.webp",
  "/subtrends/cleanlabel-3.webp",
  "/subtrends/cleanlabel-4.webp",
  "/subtrends/cleanlabel-5.webp",
  "/subtrends/cleanlabel-6.webp",
  "/subtrends/conscious-0.webp",
  "/subtrends/conscious-1.webp",
  "/subtrends/conscious-2.webp",
  "/subtrends/conscious-3.webp",
  "/subtrends/conscious-4.webp",
  "/subtrends/conscious-5.webp",
  "/subtrends/conscious-6.webp",
  "/subtrends/conscious-7.webp",
  "/subtrends/convenience-0.webp",
  "/subtrends/convenience-1.webp",
  "/subtrends/convenience-2.webp",
  "/subtrends/convenience-3.webp",
  "/subtrends/convenience-4.webp",
  "/subtrends/convenience-5.webp",
  "/subtrends/convenience-6.webp",
  "/subtrends/flavor-0.webp",
  "/subtrends/flavor-1.webp",
  "/subtrends/flavor-2.webp",
  "/subtrends/flavor-3.webp",
  "/subtrends/flavor-4.webp",
  "/subtrends/flavor-5.webp",
  "/subtrends/flavor-6.webp",
  "/subtrends/flavor-7.webp",
  "/subtrends/functional-0.webp",
  "/subtrends/functional-1.webp",
  "/subtrends/functional-2.webp",
  "/subtrends/functional-3.webp",
  "/subtrends/functional-4.webp",
  "/subtrends/functional-5.webp",
  "/subtrends/functional-6.webp",
  "/subtrends/glp1-0.webp",
  "/subtrends/glp1-1.webp",
  "/subtrends/glp1-2.webp",
  "/subtrends/glp1-3.webp",
  "/subtrends/glp1-4.webp",
  "/subtrends/glp1-5.webp",
  "/subtrends/glp1-6.webp",
  "/subtrends/protein-0.webp",
  "/subtrends/protein-1.webp",
  "/subtrends/protein-2.webp",
  "/subtrends/protein-3.webp",
  "/subtrends/protein-4.webp",
  "/subtrends/protein-5.webp",
  "/subtrends/protein-6.webp",
  "/subtrends/protein-7.webp",
  "/subtrends/social-0.webp",
  "/subtrends/social-1.webp",
  "/subtrends/social-10.webp",
  "/subtrends/social-11.webp",
  "/subtrends/social-2.webp",
  "/subtrends/social-3.webp",
  "/subtrends/social-4.webp",
  "/subtrends/social-5.webp",
  "/subtrends/social-6.webp",
  "/subtrends/social-7.webp",
  "/subtrends/social-8.webp",
  "/subtrends/social-9.webp",
  "/subtrends/value-0.webp",
  "/subtrends/value-1.webp",
  "/subtrends/value-2.webp",
  "/subtrends/value-3.webp",
  "/subtrends/value-4.webp",
  "/subtrends/value-5.webp",
];

// Scroll-reveal: fades + slides content up the first time it enters the viewport.
function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ob = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setShown(true); ob.disconnect(); } },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{ transitionDelay: shown ? `${delay}ms` : "0ms" }}
      className={`${className ?? ""} transition-all duration-700 ease-out will-change-transform ${shown ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}
    >
      {children}
    </div>
  );
}

// Counts up from 0 to `value` once the number scrolls into view.
function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ob = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || started.current) return;
      started.current = true;
      const start = performance.now();
      const duration = 1100;
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        setDisplay(Math.round(eased * value));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      ob.disconnect();
    }, { threshold: 0.4 });
    ob.observe(el);
    return () => ob.disconnect();
  }, [value]);
  return <span ref={ref}>{display}</span>;
}

const ASK_EXAMPLES = [
  "What's driving Tyson's #1 megatrend, The Protein Era?",
  "Is demand for protein snacks actually rising?",
  "What's Tyson's white space in clean label?",
];

// A real, working question box — not another browse-this-page tile — so it reads
// unmistakably as "type here, get a chat answer" rather than a fourth content card.
function AskBar() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [placeholder, setPlaceholder] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setPlaceholder((p) => (p + 1) % ASK_EXAMPLES.length), 3200);
    return () => clearInterval(id);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    router.push(query ? `/ask?q=${encodeURIComponent(query)}` : "/ask");
  };

  return (
    <form
      onSubmit={submit}
      className="group flex items-center gap-3 rounded-2xl bg-gradient-to-br from-slate-900 to-emerald-950 p-1.5 shadow-lg shadow-emerald-950/20 transition hover:shadow-xl"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-sky-500 text-lg shadow-md shadow-emerald-500/30">
        💬
      </div>
      <div className="min-w-0 flex-1 py-1">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-300/80">
          Ask TrendLens · Chat
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Ask anything — "${ASK_EXAMPLES[placeholder]}"`}
          className="mt-0.5 w-full truncate bg-transparent text-[15px] text-white placeholder:text-white/45 focus:outline-none"
        />
      </div>
      <button
        type="submit"
        aria-label="Ask TrendLens"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-slate-900 transition group-hover:scale-105 group-hover:bg-emerald-50"
      >
        <span aria-hidden className="text-lg">→</span>
      </button>
    </form>
  );
}

export default function HomePage() {
  const [stats, setStats] = useState<HomeStats | null>(null);
  const [chips, setChips] = useState<CodexChip[]>([]);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    fetch(apiUrl("/methodology"))
      .then((r) => r.json())
      .then((d) => {
        const totalReports = Array.isArray(d.sources)
          ? d.sources.reduce((acc: number, s: { reports: number }) => acc + Number(s.reports ?? 0), 0)
          : 0;
        setStats({
          reports: totalReports,
          megatrends: Number(d.synthesis?.dossiers ?? 0),
          webFinds: Number(d.synthesis?.web_finds ?? 0),
          labIdeas: Number(d.synthesis?.lab_ideas ?? 0),
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(apiUrl("/codex"))
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d.megatrends)) setChips(d.megatrends); })
      .catch(() => {});
  }, []);

  // Auto-advance the hero slideshow. Only the active slide is ever mounted — with 88
  // images in rotation, keeping all of them in the DOM at once would mean downloading
  // every one on page load.
  useEffect(() => {
    const id = setInterval(() => setSlide((s) => (s + 1) % HERO_SLIDES.length), 6000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden">
      {/* ── Hero banner — static, auto-rotating slideshow with a gentle Ken Burns zoom ── */}
      <section className="relative h-[560px] overflow-hidden border-b border-slate-200 bg-slate-950">
        <div key={slide} className="animate-in fade-in absolute inset-0 duration-1000 ease-in-out">
          <Image
            src={assetUrl(HERO_SLIDES[slide])}
            alt=""
            fill
            priority={slide === 0}
            className="animate-kenburns object-cover brightness-[1.12] saturate-[1.2] contrast-[1.03]"
            sizes="100vw"
          />
        </div>

        {/* Dark gradient overlay — heavier on the left so text pops, lighter overall so the photo still reads */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/35 to-black/5" />
        {/* Bottom fade to page bg */}
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#FAF9F6] to-transparent" />

        {/* Text content */}
        <div className="animate-in fade-in slide-in-from-bottom-6 duration-1000 relative flex h-full flex-col justify-center px-12 lg:px-16">
          <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-white/80 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Tyson Foods · Innovation Intelligence
          </div>

          <h1 className="font-display text-[60px] font-semibold leading-[1.04] tracking-tight text-white">
            TrendLens
          </h1>

          <p className="mt-4 max-w-[480px] text-[17px] leading-relaxed text-white/70">
            From agency decks to real-time demand signals, synthesized into navigable intelligence.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/megatrends"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-md transition hover:scale-[1.03] hover:bg-slate-100"
            >
              Explore Megatrends <span aria-hidden>→</span>
            </Link>
            <Link
              href="/discover"
              className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:scale-[1.03] hover:bg-white/20"
            >
              Discover <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Stats strip ──────────────────────────────────────────── */}
      {stats && (
        <section className="relative z-10 -mt-8 px-8">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-3.5 lg:grid-cols-4">
            {[
              { value: stats.reports, label: "Reports ingested", icon: "▣", accent: "text-emerald-600" },
              { value: stats.megatrends, label: "Megatrends tracked", icon: "🏛️", accent: "text-sky-600" },
              { value: stats.webFinds, label: "Web signals harvested", icon: "🔍", accent: "text-amber-600" },
              { value: stats.labIdeas, label: "White-space ideas", icon: "🔭", accent: "text-violet-600" },
            ].map(({ value, label, icon, accent }, i) => (
              <Reveal key={label} delay={i * 80}>
                <div className="flex items-center gap-3.5 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-md transition hover:-translate-y-0.5 hover:shadow-lg">
                  <span className={`text-xl ${accent}`}>{icon}</span>
                  <div className="min-w-0">
                    <div className="text-[22px] font-bold leading-none tabular-nums text-slate-900">
                      <CountUp value={value} />
                    </div>
                    <div className="mt-1 truncate text-[11px] text-slate-500">{label}</div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* ── Live megatrend ticker — continuous scrolling marquee ────── */}
      {chips.length > 0 && (
        <section className="relative mt-10 overflow-hidden border-y border-slate-800 bg-slate-950 py-3">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-slate-950 to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-slate-950 to-transparent" />
          <div className="flex w-max animate-marquee gap-10">
            {[...chips, ...chips].map((c, i) => (
              <Link
                key={`${c.key}-${i}`}
                href={`/best?key=${c.key}`}
                className="flex items-center gap-2.5 whitespace-nowrap text-[13px] font-medium text-white/70 transition hover:text-white"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                <span className="font-semibold text-white/90">{c.name}</span>
                {c.tagline && <span className="text-white/35">— {c.tagline}</span>}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Ask TrendLens bar ────────────────────────────────────── */}
      {!HOSTED && (
        <Reveal>
          <section className="px-8 pt-10">
            <div className="mx-auto max-w-6xl">
              <AskBar />
            </div>
          </section>
        </Reveal>
      )}

      {/* ── Feature cards ────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-8 pb-10 pt-10">
        {/* Ambient decorative glow */}
        <div className="animate-float-blob pointer-events-none absolute -left-24 top-4 h-72 w-72 rounded-full bg-gradient-to-br from-emerald-400/10 to-transparent blur-3xl" />
        <div className="animate-float-blob pointer-events-none absolute -right-16 bottom-0 h-72 w-72 rounded-full bg-gradient-to-br from-violet-400/10 to-transparent blur-3xl [animation-delay:-4s]" />

        <div className="relative mx-auto max-w-6xl">
          <Reveal>
            <p className="mb-7 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
              Explore
            </p>
          </Reveal>

          {/* Featured row: Megatrends + Discover — the two remaining destinations */}
          <div className="grid grid-cols-2 gap-4">
            <Reveal>
              <Link
                href="/megatrends"
                className="group relative flex min-h-[220px] flex-col overflow-hidden rounded-2xl shadow-sm transition hover:shadow-lg hover:-translate-y-0.5"
              >
                <Image
                  src={assetUrl("/megatrends/protein.webp")}
                  alt="Megatrends"
                  fill
                  className="object-cover brightness-[1.1] saturate-[1.15] transition duration-500 group-hover:scale-105"
                  sizes="(max-width: 768px) 100vw, 66vw"
                />
                <div className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/25 to-black/5" />
                <div className="relative flex flex-1 flex-col justify-between p-7">
                  <div>
                    <span className="text-2xl">🏛️</span>
                    <h3 className="mt-3 font-display text-2xl font-semibold text-white">
                      Megatrends
                    </h3>
                    <p className="mt-2 max-w-xs text-[13.5px] leading-relaxed text-white/75">
                      10 canonical trend dossiers, fully synthesized, cited, and demand-validated across all ingested sources.
                    </p>
                  </div>
                  <div className="mt-6 inline-flex items-center gap-1.5 text-[12px] font-semibold text-white/80 transition group-hover:text-white">
                    Open dossiers <span aria-hidden>→</span>
                  </div>
                </div>
              </Link>
            </Reveal>

            {/* Discover — new-in-market, white space, Tyson concepts, and the bottom-up
                trend-map taxonomy check, all in one page now */}
            <Reveal delay={100}>
              <Link
                href="/discover"
                className="group relative flex min-h-[220px] flex-col overflow-hidden rounded-2xl shadow-sm transition hover:shadow-lg hover:-translate-y-0.5"
              >
                <Image
                  src={assetUrl("/subtrends/blur-3.webp")}
                  alt="Discover"
                  fill
                  className="object-cover brightness-[1.1] saturate-[1.15] transition duration-500 group-hover:scale-105"
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
                <div className="absolute inset-0 bg-gradient-to-br from-violet-950/75 via-indigo-950/45 to-black/10" />
                <div className="relative flex flex-1 flex-col justify-between p-7">
                  <div>
                    <span className="text-2xl">🔭</span>
                    <h3 className="mt-3 font-display text-2xl font-semibold text-white">
                      Discover
                    </h3>
                    <p className="mt-2 max-w-xs text-[13.5px] leading-relaxed text-white/75">
                      New in US retail, novelty-gated white space, Tyson concepts, and a bottom-up check on the megatrend taxonomy itself.
                    </p>
                  </div>
                  <div className="mt-6 inline-flex items-center gap-1.5 text-[12px] font-semibold text-white/80 transition group-hover:text-white">
                    Explore <span aria-hidden>→</span>
                  </div>
                </div>
              </Link>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Floating methodology button ───────────────────────────── */}
      <Link
        href="/methodology"
        className="fixed bottom-6 right-6 z-50 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-[12px] font-semibold text-slate-600 shadow-lg transition hover:bg-slate-50 hover:text-slate-900 hover:shadow-xl"
      >
        <span className="text-base">🧭</span>
        How TrendLens works
      </Link>
    </div>
  );
}
