"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/reports",  label: "Reports",     icon: "▣",  match: (p: string) => p.startsWith("/report") },
  { href: "/mintel",   label: "Mintel",      icon: "📚", match: (p: string) => p.startsWith("/mintel") },
  { href: "/tyson",    label: "Tyson Bites", icon: "🐔", match: (p: string) => p.startsWith("/tyson") },
];

export function SourcesSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-12 z-10 flex h-[calc(100vh-3rem)] w-56 flex-col border-r border-slate-200 bg-[#FAF9F6]">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Sources</div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {ITEMS.map(({ href, label, icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all ${
                active
                  ? "bg-slate-100 font-semibold text-slate-900"
                  : "font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              <span className={`h-4 w-0.5 rounded-full transition-colors ${active ? "bg-emerald-500" : "bg-transparent"}`} />
              <span className="w-5 text-center text-base opacity-90">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-100 px-5 py-4 text-[11px] leading-relaxed text-slate-400">
        Powered by Claude Opus 4.8
      </div>
    </aside>
  );
}
