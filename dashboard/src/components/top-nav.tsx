"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HOSTED } from "@/lib/api";

const NAV_ITEMS = [
  { href: "/",         label: "Home",            match: (p: string) => p === "/" },
  { href: "/megatrends", label: "Megatrends",     match: (p: string) => p.startsWith("/megatrends") || p.startsWith("/best") },
  { href: "/discover", label: "Discover",         match: (p: string) => p.startsWith("/discover") },
];

// Needs a live Next.js server (BigQuery + LiteLLM) — hidden in the hosted static export,
// same reasoning as Global Search.
const ASK_ITEM = { href: "/ask", label: "Ask TrendLens", match: (p: string) => p.startsWith("/ask") };

export function TopNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed left-0 right-0 top-0 z-20 flex h-12 items-center justify-center bg-white/80 backdrop-blur-md">
      {/* Gradient bottom border */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-emerald-400 via-sky-400 to-violet-400 opacity-50" />

      <div className="flex items-center gap-0.5">
        {(HOSTED ? NAV_ITEMS : [...NAV_ITEMS, ASK_ITEM]).map(({ href, label, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all ${
                active
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {!HOSTED && (
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("open-global-search"))}
          className="absolute right-4 flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-slate-400 transition-colors hover:border-slate-300 hover:text-slate-600"
        >
          <span>🔍</span>
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden rounded border border-slate-200 bg-slate-50 px-1 text-[9px] font-semibold text-slate-400 sm:inline">⌘K</kbd>
        </button>
      )}
    </nav>
  );
}
