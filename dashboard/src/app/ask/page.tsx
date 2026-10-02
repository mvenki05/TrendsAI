"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { apiUrl } from "@/lib/api";
import { citeHref } from "@/lib/citations";
import { parseAnswerCitations, type StatItem } from "@/lib/ask/parse-citations";

interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  toolsUsed?: string[];
  error?: string;
}

const STARTER_QUESTIONS = [
  "What's driving Tyson's #1 megatrend, The Protein Era?",
  "What's fueling The Value Recalibration — private label, trading down, value-seeking?",
  "What's Tyson's white space in Trust & Transparency (clean label)?",
  "What's behind Functional Everything: fiber, gut health, and mood/beauty claims?",
  "Is demand for protein snacks actually rising?",
  "What Tyson products already exist in frozen value-added poultry?",
];

const TOOL_META: Record<string, { label: string; icon: string; color: string }> = {
  search_megatrends: { label: "Megatrend Codex", icon: "🏛️", color: "bg-emerald-50 text-emerald-700" },
  search_reports_and_taxonomy: { label: "Reports & Taxonomy", icon: "📄", color: "bg-sky-50 text-sky-700" },
  search_insights: { label: "Tyson Bites Insights", icon: "🐔", color: "bg-rose-50 text-rose-700" },
  search_ideas: { label: "Ideas & Signals", icon: "💡", color: "bg-violet-50 text-violet-700" },
  search_trends_numeric: { label: "Google Trends", icon: "📈", color: "bg-amber-50 text-amber-700" },
  list_tyson_products: { label: "Tyson Catalog", icon: "📦", color: "bg-slate-100 text-slate-600" },
};

// Small monogram badge used as the assistant's "avatar" throughout the thread.
function AssistantBadge() {
  return (
    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-sky-500 text-[10.5px] font-bold text-white shadow-sm">
      TL
    </div>
  );
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300 [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300 [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300" />
    </span>
  );
}

// Shared renderer for the `a` tags markdown produces once [n] markers are turned
// into real links — used by both the Key Takeaways block and the main body so
// citation styling stays identical in both places.
const citeLinkComponents = {
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noreferrer"
       className="align-super text-[10.5px] font-extrabold text-sky-600 no-underline hover:text-sky-800 hover:underline">
      {children}
    </a>
  ),
};

function withCiteLinks(text: string, hrefByN: Map<number, string | null | undefined>) {
  return text.replace(/\[(\d+)\]/g, (match, numStr) => {
    const href = hrefByN.get(Number(numStr));
    return href ? `[[${numStr}]](${href})` : match;
  });
}

// direction × good → status color, per the stat-tile contract: only the delta/trend
// text carries semantic color, never the headline value itself.
function statStatus(stat: StatItem): "good" | "bad" | "neutral" {
  if (!stat.direction || stat.direction === "flat" || stat.good === undefined) return "neutral";
  return stat.good ? "good" : "bad";
}

const STATUS_TEXT: Record<"good" | "bad" | "neutral", string> = {
  good: "text-emerald-600",
  bad: "text-rose-600",
  neutral: "text-slate-500",
};

const ARROW: Record<"up" | "down" | "flat", string> = { up: "▲", down: "▼", flat: "→" };

// Per the stat-tile "trend" spec: a de-emphasized line for the shape, with only the
// current/last point carrying the status accent — never the whole line in status color.
const SPARK_DOT: Record<"good" | "bad" | "neutral", string> = {
  good: "fill-emerald-600",
  bad: "fill-rose-600",
  neutral: "fill-slate-400",
};

function Sparkline({ series, status }: { series: number[]; status: "good" | "bad" | "neutral" }) {
  const w = 100;
  const h = 26;
  const pad = 3;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const points = series.map((v, i) => {
    const x = pad + (i / (series.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return [x, y] as const;
  });
  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-2 h-6 w-full" aria-hidden>
      <polyline
        points={points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}
        fill="none"
        className="stroke-slate-300"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={lastX} cy={lastY} r={2.5} className={`${SPARK_DOT[status]} stroke-white`} strokeWidth={1} />
    </svg>
  );
}

// Same query shape src/trends_browser.py's EXPLORE constant uses (12-month window, US,
// en-US) so the live page a reader lands on matches what our own measurement queried —
// this is the one stat type the model can't attach a report/web citation to (aggregate
// Trends numbers carry no single source document), so it's the proof link instead.
function googleTrendsHref(term: string): string {
  return `https://trends.google.com/trends/explore?date=today%2012-m&geo=US&hl=en-US&q=${encodeURIComponent(term)}`;
}

function StatTile({ stat, href }: { stat: StatItem; href?: string | null }) {
  const status = statStatus(stat);
  const linkHref = href ?? (stat.term ? googleTrendsHref(stat.term) : undefined);
  const linkTitle = href ? undefined : stat.term ? "Confirm live on Google Trends" : undefined;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <p className="line-clamp-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{stat.label}</p>
      <p className="mt-1 text-[22px] font-bold leading-none text-slate-900">{stat.value}</p>
      {stat.delta && (
        <p className={`mt-1.5 flex items-center gap-1 text-[11.5px] font-semibold ${STATUS_TEXT[status]}`}>
          {stat.direction && <span aria-hidden>{ARROW[stat.direction]}</span>}
          <span className="truncate">{stat.delta}</span>
          {linkHref && (
            <a href={linkHref} target="_blank" rel="noreferrer" title={linkTitle}
               className="shrink-0 text-slate-300 hover:text-sky-600">
              ↗
            </a>
          )}
        </p>
      )}
      {stat.series && <Sparkline series={stat.series} status={status} />}
    </div>
  );
}

// Renders the model's structured answer: an optional highlighted Key Takeaways
// card, an optional row of stat tiles for headline figures, the full prose body
// with [n] citation markers turned into clickable superscript links, and a
// numbered references list at the bottom — mirrors the citation UI on /best.
function AssistantAnswer({ content }: { content: string }) {
  const { takeaways, body, stats, citations } = parseAnswerCitations(content);
  const hrefByN = new Map(citations.map((c) => [c.n, citeHref(c.cite)]));

  return (
    <div>
      {takeaways.length > 0 && (
        <div className="mb-4 rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/80 via-white to-sky-50/50 p-4">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">
            <span aria-hidden>✦</span> Key takeaways
          </p>
          <div className="prose prose-sm max-w-none text-[13.5px] leading-snug text-slate-700 [&_ul]:my-0 [&_li]:my-1 [&_p]:my-0">
            <ReactMarkdown components={citeLinkComponents}>
              {withCiteLinks(takeaways.map((t) => `- ${t}`).join("\n"), hrefByN)}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {stats.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {stats.map((s, i) => (
            <StatTile key={i} stat={s} href={s.cite_n ? hrefByN.get(s.cite_n) : undefined} />
          ))}
        </div>
      )}

      <div className="prose prose-sm prose-slate max-w-none text-[14px] leading-relaxed [&_p]:my-2 [&_ul]:my-2 [&_li]:my-0.5
        [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-[19px] [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-slate-900 [&_h2]:first:mt-0
        [&_h3]:mb-1.5 [&_h3]:mt-4 [&_h3]:text-[16px] [&_h3]:font-semibold [&_h3]:tracking-tight [&_h3]:text-slate-900 [&_h3]:first:mt-0">
        <ReactMarkdown components={citeLinkComponents}>{withCiteLinks(body, hrefByN)}</ReactMarkdown>
      </div>

      {citations.length > 0 && (
        <div className="mt-4 rounded-xl bg-slate-50 p-3.5">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Sources</p>
          <ol className="space-y-1.5">
            {citations.map(({ n, cite }) => {
              const href = citeHref(cite);
              return (
                <li key={n} className="flex gap-2 text-[12px] leading-relaxed">
                  <span className="w-5 shrink-0 text-right font-extrabold text-sky-600">[{n}]</span>
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer" className="min-w-0 text-slate-600 hover:text-sky-700 hover:underline">
                      {cite.kind === "web" ? "↗ " : "📄 "}{cite.label || (cite.kind === "web" ? cite.url : "source document")}
                      {cite.page ? <span className="text-slate-400"> · p.{cite.page}</span> : null}
                    </a>
                  ) : (
                    <span className="text-slate-500">{cite.label}</span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}

export default function AskPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  // Auto-send a question passed in via ?q= (the home page's Ask bar) — read straight
  // from window.location rather than useSearchParams so this page needs no Suspense
  // boundary during the hosted static export build.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q && q.trim()) {
      window.history.replaceState({}, "", window.location.pathname);
      send(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;

    const history = messages.map((m) => ({
      role: m.role,
      content: m.role === "assistant" ? parseAnswerCitations(m.content).body : m.content,
    }));

    setMessages((prev) => [...prev, { role: "user", content: q }, { role: "assistant", content: "", streaming: true }]);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch(apiUrl("/ask"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history }),
      });
      if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const evt of events) {
          const line = evt.trim();
          if (!line.startsWith("data:")) continue;
          const payload = JSON.parse(line.slice(5).trim());
          if (payload.delta) {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              next[next.length - 1] = { ...last, content: last.content + payload.delta };
              return next;
            });
          } else if (payload.done) {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              next[next.length - 1] = { ...last, streaming: false, toolsUsed: payload.toolsUsed ?? [] };
              return next;
            });
          } else if (payload.error) {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              next[next.length - 1] = { ...last, streaming: false, error: payload.error };
              return next;
            });
          }
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        next[next.length - 1] = { ...last, streaming: false, error: err instanceof Error ? err.message : String(err) };
        return next;
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col bg-[#FAF9F6]">
      {/* Slim sticky header */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/85 px-5 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-emerald-500 to-sky-500 text-[10px] font-bold text-white">TL</span>
          <span className="text-[13px] font-semibold text-slate-700">Ask TrendLens</span>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="rounded-full px-2.5 py-1 text-[12px] font-medium text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            New chat
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-8">
        <div className="mx-auto w-4/5">
          {messages.length === 0 ? (
            <div className="pt-14 text-center">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-sky-500 text-2xl shadow-lg shadow-emerald-500/20">
                💬
              </div>
              <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Ask TrendLens</p>
              <h1 className="font-display mt-3 text-4xl font-semibold tracking-tight text-slate-900">
                What do you want to know?
              </h1>
              <p className="mx-auto mt-3 max-w-md text-[14.5px] leading-relaxed text-slate-500">
                Ask anything grounded in TrendLens&apos;s reports, megatrend dossiers, ideas, and Google Trends data.
                Every answer is cited.
              </p>

              <div className="mx-auto mt-9 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {STARTER_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                  >
                    <span className="mt-0.5 text-slate-300 transition group-hover:text-emerald-500">✦</span>
                    <span className="text-[13px] leading-snug text-slate-600 group-hover:text-slate-900">{q}</span>
                  </button>
                ))}
              </div>

              <div className="mx-auto mt-8 flex max-w-md flex-wrap justify-center gap-1.5">
                {Object.values(TOOL_META).map(({ label, icon, color }) => (
                  <span key={label} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${color}`}>
                    {icon} {label}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`animate-in fade-in slide-in-from-bottom-2 flex gap-3 duration-300 ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {m.role === "assistant" && <AssistantBadge />}

                  {m.role === "user" ? (
                    <div className="max-w-[75%] rounded-2xl rounded-br-sm bg-slate-900 px-4 py-2.5 text-[14px] text-white shadow-sm">
                      {m.content}
                    </div>
                  ) : (
                    <div className="min-w-0 max-w-[85%] flex-1 rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-5 py-4 shadow-sm">
                      {m.toolsUsed && m.toolsUsed.length > 0 && (
                        <div className="mb-3 flex flex-wrap gap-1.5">
                          {m.toolsUsed.map((t) => {
                            const meta = TOOL_META[t];
                            return (
                              <span key={t} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${meta?.color ?? "bg-slate-100 text-slate-500"}`}>
                                {meta?.icon ?? "✓"} {meta?.label ?? t}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {m.content ? (
                        <AssistantAnswer content={m.content} />
                      ) : m.streaming ? (
                        <ThinkingDots />
                      ) : null}
                      {m.error && (
                        <p className="mt-2 text-[12.5px] text-rose-600">Something went wrong: {m.error}</p>
                      )}
                      {m.streaming && m.content && (
                        <span className="ml-0.5 inline-block h-3.5 w-[3px] animate-pulse bg-slate-400 align-middle" />
                      )}
                    </div>
                  )}
                </div>
              ))}
              <div ref={scrollRef} />
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-slate-200 bg-white/90 px-4 py-4 backdrop-blur-md">
        <form
          onSubmit={(e) => { e.preventDefault(); send(input); }}
          className="mx-auto flex w-4/5 items-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 p-1.5 shadow-sm transition focus-within:border-slate-300 focus-within:bg-white focus-within:shadow-md"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about a trend, a report, an idea, or demand data…"
            disabled={busy}
            className="flex-1 bg-transparent px-3 py-2 text-[14px] text-slate-800 placeholder:text-slate-400 focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Send"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white transition hover:bg-slate-800 disabled:opacity-30"
          >
            {busy ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              <span aria-hidden className="text-[15px]">↑</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
