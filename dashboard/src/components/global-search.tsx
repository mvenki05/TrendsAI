"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api";

interface SearchResult {
  type: "codex" | "report" | "node" | "idea" | "lab" | "map" | "theme" | "discovery";
  title: string;
  subtitle?: string;
  href: string;
}

const GROUPS: Record<SearchResult["type"], { label: string; icon: string }> = {
  codex: { label: "Megatrends", icon: "🏛️" },
  report: { label: "Reports", icon: "▣" },
  node: { label: "Report sections", icon: "🌱" },
  map: { label: "Trend Map", icon: "🗺️" },
  idea: { label: "Innovation Ideas", icon: "💡" },
  lab: { label: "White Space", icon: "🔭" },
  discovery: { label: "Web Discovery", icon: "🔍" },
  theme: { label: "Tyson Bites", icon: "🐔" },
};
const GROUP_ORDER: SearchResult["type"][] = ["codex", "report", "node", "map", "idea", "lab", "discovery", "theme"];

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const close = useCallback(() => {
    setOpen(false);
    setTerm("");
    setResults([]);
    setActiveIdx(0);
  }, []);

  // Cmd/Ctrl+K opens; TopNav's search button opens via the same custom event.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    function onOpenEvent() { setOpen(true); }
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("open-global-search", onOpenEvent);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("open-global-search", onOpenEvent);
    };
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10);
    else close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (term.trim().length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const handle = setTimeout(() => {
      fetch(apiUrl(`/search?q=${encodeURIComponent(term.trim())}`))
        .then((r) => r.json())
        .then((d) => { setResults(Array.isArray(d.results) ? d.results : []); setActiveIdx(0); })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 220);
    return () => clearTimeout(handle);
  }, [term]);

  const ordered = GROUP_ORDER.flatMap((t) => results.filter((r) => r.type === t));

  function go(r: SearchResult) {
    close();
    router.push(r.href);
  }

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, ordered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && ordered[activeIdx]) { e.preventDefault(); go(ordered[activeIdx]); }
  }

  if (!open) return null;

  let runningIdx = -1;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/40 px-4 pt-[12vh]" onMouseDown={close}>
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3">
          <span className="text-slate-400">🔍</span>
          <input
            ref={inputRef}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search megatrends, reports, ideas, subtrends…"
            className="w-full bg-transparent text-[14px] text-slate-800 placeholder:text-slate-400 focus:outline-none"
          />
          <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">Esc</kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto py-1.5">
          {loading && (
            <div className="px-4 py-6 text-center text-[13px] text-slate-400">Searching…</div>
          )}
          {!loading && term.trim().length >= 2 && ordered.length === 0 && (
            <div className="px-4 py-6 text-center text-[13px] text-slate-400">No matches for &ldquo;{term}&rdquo;</div>
          )}
          {!loading && term.trim().length < 2 && (
            <div className="px-4 py-6 text-center text-[13px] text-slate-400">Type at least 2 characters…</div>
          )}

          {!loading && GROUP_ORDER.map((type) => {
            const items = results.filter((r) => r.type === type);
            if (items.length === 0) return null;
            const { label, icon } = GROUPS[type];
            return (
              <div key={type} className="px-2 py-1">
                <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  {icon} {label}
                </div>
                {items.map((r) => {
                  runningIdx += 1;
                  const idx = runningIdx;
                  const active = idx === activeIdx;
                  return (
                    <button
                      key={`${type}-${idx}`}
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => go(r)}
                      className={`flex w-full flex-col items-start rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                        active ? "bg-slate-100" : "hover:bg-slate-50"
                      }`}
                    >
                      <span className="line-clamp-1 text-[13px] font-medium text-slate-800">{r.title}</span>
                      {r.subtitle && (
                        <span className="line-clamp-1 text-[11.5px] text-slate-400">{r.subtitle}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
