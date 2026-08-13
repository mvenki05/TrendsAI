"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

const CODEX_DOTS: Record<string, string> = {
  protein: "bg-red-500", value: "bg-amber-500", flavor: "bg-orange-500",
  social: "bg-indigo-500", functional: "bg-lime-600", cleanlabel: "bg-emerald-500",
  convenience: "bg-teal-500", conscious: "bg-green-600", blur: "bg-sky-500", glp1: "bg-purple-500",
};

const MORE_GROUPS: { title: string; items: { href: string; label: string; icon: string; match: (p: string) => boolean }[] }[] = [
  {
    title: "Intelligence",
    items: [
      { href: "/reports", label: "Reports", icon: "▣", match: (p) => p.startsWith("/report") },
      { href: "/map", label: "Trend Map", icon: "🗺️", match: (p) => p.startsWith("/map") },
    ],
  },
  {
    title: "Discovery",
    items: [
      { href: "/discover", label: "Web Discovery", icon: "🔍", match: (p) => p.startsWith("/discover") },
      { href: "/ideas", label: "Innovation Ideas", icon: "💡", match: (p) => p.startsWith("/ideas") },
      { href: "/lab", label: "White Space", icon: "🔭", match: (p) => p.startsWith("/lab") },
    ],
  },
  {
    title: "Sources",
    items: [
      { href: "/mintel", label: "Mintel", icon: "📚", match: (p) => p.startsWith("/mintel") },
      { href: "/hartman", label: "Hartman", icon: "🍽️", match: (p) => p.startsWith("/hartman") },
      { href: "/tyson", label: "Tyson Bites", icon: "🐔", match: (p) => p.startsWith("/tyson") },
    ],
  },
];

function isMorePage(pathname: string) {
  return MORE_GROUPS.flatMap((g) => g.items).some(({ match }) => match(pathname));
}

type CodexMode = "closed" | "list" | "detail";

// Sections before the subtrends block, sections after
const SECTIONS_BEFORE: [string, string][] = [
  ["sec-now",      "What's happening now"],
  ["sec-horizons", "Horizons"],
];
const SECTIONS_AFTER: [string, string][] = [
  ["sec-stats",   "Key stats"],
  ["sec-tyson",   "Tyson layer"],
  ["sec-sources", "References"],
];

export function Sidebar() {
  const pathname = usePathname();
  const [moreExpanded, setMoreExpanded] = useState(false);
  const [codexRows, setCodexRows] = useState<{ key: string; name: string }[]>([]);
  const [codexActive, setCodexActive] = useState<string | null>(null);
  const [codexSubtrends, setCodexSubtrends] = useState<string[]>([]);
  const [codexMode, setCodexMode] = useState<CodexMode>("closed");

  const onCodex = pathname.startsWith("/best");

  useEffect(() => {
    if (!onCodex || codexRows.length > 0) return;
    fetch("/api/codex")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.megatrends))
          setCodexRows(d.megatrends.map((r: { key: string; name: string }) => ({ key: r.key, name: r.name })));
      })
      .catch(() => {});
  }, [onCodex, codexRows.length]);

  useEffect(() => {
    if (!onCodex) { setCodexMode("closed"); setCodexActive(null); }
  }, [onCodex]);

  useEffect(() => {
    const h = (e: Event) => setCodexActive((e as CustomEvent).detail);
    window.addEventListener("codex-active", h);
    return () => window.removeEventListener("codex-active", h);
  }, []);

  useEffect(() => {
    const h = (e: Event) => setCodexSubtrends((e as CustomEvent).detail);
    window.addEventListener("codex-subtrends", h);
    return () => window.removeEventListener("codex-subtrends", h);
  }, []);

  useEffect(() => {
    if (isMorePage(pathname)) setMoreExpanded(true);
  }, [pathname]);

  function handleCodexLinkClick(e: React.MouseEvent) {
    if (!onCodex) return;
    e.preventDefault();
    setCodexMode((m) => (m === "list" ? "closed" : "list"));
  }

  function handleMegatrendClick(key: string) {
    window.dispatchEvent(new CustomEvent("codex-select", { detail: key }));
    setCodexMode("detail");
  }

  // Running counter for section numbers
  let sectionNum = 0;
  function nextNum() { sectionNum += 1; return sectionNum; }

  const NavLink = ({ href, label, icon, active, onClick }: {
    href: string; label: string; icon: string; active: boolean;
    onClick?: (e: React.MouseEvent) => void;
  }) => (
    <Link
      href={href}
      onClick={onClick}
      className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all ${
        active ? "bg-slate-100 font-semibold text-slate-900" : "font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800"
      }`}
    >
      <span className={`h-4 w-0.5 rounded-full transition-colors ${active ? "bg-emerald-500" : "bg-transparent group-hover:bg-slate-200"}`} />
      <span className="w-5 text-center text-base opacity-90">{icon}</span>
      {label}
    </Link>
  );

  return (
    <aside className="fixed left-0 top-0 z-10 flex h-full w-56 flex-col border-r border-slate-200 bg-[#FAF9F6]">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-5 transition hover:bg-slate-50">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-sky-600 text-base font-bold text-white shadow-sm">
          T
        </div>
        <div className="min-w-0">
          <div className="font-display text-lg font-semibold tracking-tight text-slate-900">TrendLens</div>
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">Trend Intelligence</div>
        </div>
      </Link>

      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {/* Megatrends nav item */}
        <NavLink
          href="/best"
          label="Megatrends"
          icon="🏛️"
          active={onCodex}
          onClick={onCodex ? handleCodexLinkClick : undefined}
        />

        {/* Megatrend list — full-width image cards */}
        {onCodex && codexMode === "list" && codexRows.length > 0 && (
          <div className="mt-2 space-y-1.5 px-1">
            {codexRows.map((r) => (
              <button
                key={r.key}
                onClick={() => handleMegatrendClick(r.key)}
                className="group w-full overflow-hidden rounded-xl border border-slate-100 text-left shadow-sm transition hover:shadow-md hover:border-slate-200"
              >
                <div className="flex items-center gap-2.5 px-2.5 py-2">
                  <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md">
                    <Image
                      src={`/megatrends/${r.key}.png`}
                      alt={r.name}
                      fill
                      className="object-cover transition duration-300 group-hover:scale-105"
                      sizes="32px"
                    />
                  </div>
                  <span className="line-clamp-2 text-[11.5px] font-medium leading-tight text-slate-600 group-hover:text-slate-900">
                    {r.name}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* On this page — detail mode */}
        {onCodex && codexMode === "detail" && codexActive && (
          <div className="mt-2 px-1">
            {/* Back button */}
            <button
              onClick={() => setCodexMode("list")}
              className="mb-3 flex items-center gap-1.5 text-[11px] font-medium text-slate-400 hover:text-slate-700 transition-colors"
            >
              ← All megatrends
            </button>

            {/* Active megatrend hero */}
            <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-slate-100 px-2.5 py-2 shadow-sm">
              <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md">
                <Image
                  src={`/megatrends/${codexActive}.png`}
                  alt={codexActive}
                  fill
                  className="object-cover"
                  sizes="32px"
                />
              </div>
              <span className="line-clamp-2 text-[11.5px] font-semibold leading-tight text-slate-700">
                {codexRows.find((r) => r.key === codexActive)?.name ?? codexActive}
              </span>
            </div>

            {/* Section list: numbered, subtrends nested inline */}
            <div className="space-y-0.5">
              {/* Sections before subtrends */}
              {SECTIONS_BEFORE.map(([id, label]) => {
                const n = nextNum();
                return (
                  <button key={id}
                    onClick={() => window.dispatchEvent(new CustomEvent("codex-jump-section", { detail: id }))}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900">
                    <span className="w-4 shrink-0 text-[10px] font-bold text-slate-400">{n}.</span>
                    {label}
                  </button>
                );
              })}

              {/* Subtrends section + nested names */}
              <div>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent("codex-jump-section", { detail: "sec-subtrends" }))}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900">
                  <span className="w-4 shrink-0 text-[10px] font-bold text-slate-400">{nextNum()}.</span>
                  Subtrends
                </button>
                {codexSubtrends.length > 0 && (
                  <div className="mb-0.5 ml-6 space-y-0.5">
                    {codexSubtrends.map((name, i) => (
                      <button key={i}
                        onClick={() => window.dispatchEvent(new CustomEvent("codex-jump-subtrend", { detail: i }))}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition hover:bg-slate-50">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${CODEX_DOTS[codexActive] ?? "bg-slate-400"}`} />
                        <span className="line-clamp-2 text-[11px] leading-tight text-slate-500 hover:text-slate-800">{name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Sections after subtrends */}
              {SECTIONS_AFTER.map(([id, label]) => {
                const n = nextNum();
                return (
                  <button key={id}
                    onClick={() => window.dispatchEvent(new CustomEvent("codex-jump-section", { detail: id }))}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900">
                    <span className="w-4 shrink-0 text-[10px] font-bold text-slate-400">{n}.</span>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Methodology */}
        <div className="mt-0.5">
          <NavLink href="/methodology" label="Methodology" icon="🧭" active={pathname.startsWith("/methodology")} />
        </div>

        {/* More toggle */}
        <button
          onClick={() => setMoreExpanded((v) => !v)}
          className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-widest text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
        >
          <span className={`transition-transform duration-200 ${moreExpanded ? "rotate-90" : ""}`}>›</span>
          {moreExpanded ? "Hide" : "More"}
        </button>

        {moreExpanded && (
          <div className="mt-1 space-y-1">
            {MORE_GROUPS.map((g) => (
              <div key={g.title} className="mb-1">
                <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{g.title}</div>
                <div className="space-y-0.5">
                  {g.items.map(({ href, label, icon, match }) => (
                    <NavLink key={href} href={href} label={label} icon={icon} active={match(pathname)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </nav>

      <div className="border-t border-slate-100 px-5 py-4 text-[11px] leading-relaxed text-slate-400">
        Powered by Claude Opus 4.8 + Google Trends
      </div>
    </aside>
  );
}
