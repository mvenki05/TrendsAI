"use client";

import { type Cite, citeHref } from "@/lib/citations";

// Numbered superscript reference, academic style: [3]. Click opens the source directly;
// the full listing lives in the numbered References section at the bottom of the page.
export function CiteLink({ cite, refNo }: { cite?: Cite | null; refNo?: number }) {
  if (!cite) return null;
  const href = citeHref(cite);
  const title = cite.kind === "web"
    ? `${cite.label || "External source"} — ${cite.url}`
    : `${cite.label || "Source document"}${cite.page ? ` · page ${cite.page}` : ""}`;
  if (href && refNo) {
    return (
      <a href={href} target="_blank" rel="noreferrer" title={title}
         className="align-super text-[10.5px] font-extrabold text-sky-600 hover:text-sky-800 hover:underline">
        [{refNo}]
      </a>
    );
  }
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" title={title}
         className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-200">
        {cite.kind === "web" ? "↗" : "📄"} {cite.label || "source"}
      </a>
    );
  }
  return <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">{cite.label}</span>;
}
