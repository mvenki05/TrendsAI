"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";

const NAV_ITEMS = [
  { href: "/",         label: "Home",            match: (p: string) => p === "/" },
  { href: "/megatrends", label: "Megatrends",     match: (p: string) => p.startsWith("/megatrends") || p.startsWith("/best") },
  { href: "/discover", label: "Web Discovery",    match: (p: string) => p.startsWith("/discover") },
  { href: "/map",      label: "Trend Map",        match: (p: string) => p.startsWith("/map") },
  { href: "/ideas",    label: "Innovation Ideas", match: (p: string) => p.startsWith("/ideas") },
];

const SOURCES_ITEMS = [
  { href: "/reports", label: "Reports",     icon: "▣" },
  { href: "/mintel",  label: "Mintel",      icon: "📚" },
  { href: "/tyson",   label: "Tyson Bites", icon: "🐔" },
];

export function TopNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const sourcesActive =
    pathname.startsWith("/report") ||
    pathname.startsWith("/mintel") ||
    pathname.startsWith("/tyson");

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <nav className="fixed left-0 right-0 top-0 z-20 flex h-12 items-center justify-center bg-white/80 backdrop-blur-md">
      {/* Gradient bottom border */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-emerald-400 via-sky-400 to-violet-400 opacity-50" />

      <div className="flex items-center gap-0.5">
        {NAV_ITEMS.map(({ href, label, match }) => {
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

        {/* Sources dropdown */}
        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen((v) => !v)}
            className={`flex items-center gap-1 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all ${
              sourcesActive
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            }`}
          >
            Sources
            <span className={`text-[9px] transition-transform duration-150 ${open ? "rotate-180" : ""}`}>▾</span>
          </button>

          {open && (
            <div className="absolute left-1/2 top-full mt-2 w-44 -translate-x-1/2 rounded-xl border border-slate-100 bg-white py-1 shadow-xl shadow-slate-200/60">
              {SOURCES_ITEMS.map(({ href, label, icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                >
                  <span className="text-sm">{icon}</span>
                  {label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
