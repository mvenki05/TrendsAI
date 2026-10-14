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

const CHAT_STORAGE_KEY = "trendlens-ask-chat";

const STARTERS = [
  "What's driving Tyson's #1 megatrend, The Protein Era?",
  "What's fueling The Value Recalibration: private label, trading down, value-seeking?",
  "What's Tyson's white space in Trust & Transparency (clean label)?",
  "What's behind Functional Everything: fiber, gut health, and mood/beauty claims?",
  "How is GLP-1 changing what people eat and buy?",
  "What Tyson products already exist in frozen value-added poultry?",
];

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

// One figure in the evidence rail: label above, big number, comparison, source link.
// Figures stack vertically; the rail draws the dividers between them.
function StatFigure({ stat, href, sourceLabel }: { stat: StatItem; href?: string | null; sourceLabel?: string }) {
  const status = statStatus(stat);
  return (
    <div className="min-w-0 py-4">
      <p className="line-clamp-3 text-[12px] font-bold uppercase leading-snug tracking-[0.08em] text-slate-800">{stat.label}</p>
      <p className="font-display mt-1.5 text-[34px] font-semibold leading-none tracking-tight text-slate-900">{stat.value}</p>
      {stat.delta && (
        <p className={`mt-2 flex items-center gap-1 text-[12.5px] font-semibold ${STATUS_TEXT[status]}`}>
          {stat.direction && <span aria-hidden>{ARROW[stat.direction]}</span>}
          <span className="truncate">{stat.delta}</span>
        </p>
      )}
      {href && (
        <a href={href} target="_blank" rel="noreferrer"
           className="mt-1.5 block truncate text-[11.5px] font-medium text-slate-400 hover:text-sky-600 hover:underline">
          ↗ {sourceLabel || "Source"}
        </a>
      )}
    </div>
  );
}

// Renders the model's structured answer as two columns: the story on the left (numbered Key
// Takeaways, then the prose with [n] markers as superscript links) and the proof on the right
// (key figures and Sources, pinned while the answer scrolls). Hovering a [n] marker highlights
// its source in the rail. With no evidence to show, it stays a single column.
function AssistantAnswer({ content, streaming }: { content: string; streaming?: boolean }) {
  const { takeaways, body, stats, citations } = parseAnswerCitations(content);
  const [activeN, setActiveN] = useState<number | null>(null);
  const hrefByN = new Map(citations.map((c) => [c.n, citeHref(c.cite)]));
  const labelByN = new Map(citations.map((c) => [c.n, c.cite.label || undefined]));
  // A figure with no clickable source (no resolvable citation) is dropped rather than shown
  // unreferenced; it is still stated in the answer body.
  const citedStats = stats.filter((s) => s.cite_n && hrefByN.get(s.cite_n));
  const hasRail = citedStats.length > 0 || citations.length > 0;
  // Sources arrive at the very end of the stream, so keep the rail's space reserved while
  // streaming; otherwise the text would jump narrower the moment the answer completes.
  const showRail = hasRail || !!streaming;

  const citeComponents = {
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
      const label = Array.isArray(children) ? children.map((c) => (typeof c === "string" ? c : "")).join("") : typeof children === "string" ? children : "";
      const n = parseInt(label.replace(/\D/g, ""), 10);
      return (
        <a href={href} target="_blank" rel="noreferrer"
           onMouseEnter={() => Number.isFinite(n) && setActiveN(n)} onMouseLeave={() => setActiveN(null)}
           className="align-super text-[10.5px] font-extrabold text-sky-600 no-underline hover:text-sky-800 hover:underline">
          {children}
        </a>
      );
    },
  };

  return (
    <div className={showRail ? "lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12" : ""}>
      <div className="min-w-0">
        {takeaways.length > 0 && (
          <section className="mb-7">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-700">Key takeaways</p>
            <ol className="divide-y divide-slate-200 border-y border-slate-200">
              {takeaways.map((t, i) => (
                <li key={i} className="flex gap-4 py-3.5">
                  <span className="font-display w-7 shrink-0 pt-0.5 text-[20px] font-semibold leading-none text-emerald-600">{i + 1}</span>
                  <div className="min-w-0 text-[16.5px] leading-snug text-slate-800 [&_p]:m-0 [&_strong]:font-semibold [&_strong]:text-slate-900">
                    <ReactMarkdown components={citeComponents}>{withCiteLinks(t, hrefByN)}</ReactMarkdown>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        <div className="prose max-w-none text-[15.5px] leading-[1.75] text-slate-700 [&_p]:my-3 [&_ul]:my-3 [&_li]:my-1 [&_strong]:text-slate-900
          [&_h2]:mb-2 [&_h2]:mt-7 [&_h2]:text-[24px] [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-slate-900 [&_h2]:first:mt-0
          [&_h3]:mb-1.5 [&_h3]:mt-6 [&_h3]:text-[18px] [&_h3]:font-semibold [&_h3]:tracking-tight [&_h3]:text-slate-900 [&_h3]:first:mt-0">
          <ReactMarkdown components={citeComponents}>{withCiteLinks(body, hrefByN)}</ReactMarkdown>
        </div>
      </div>

      {showRail && (
        <aside className="mt-8 min-w-0 lg:sticky lg:top-2 lg:mt-0 lg:self-start">
          {citedStats.length > 0 && (
            <section className="mb-7">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-700">Key figures</p>
              <div className="divide-y divide-slate-200 border-y border-slate-200">
                {citedStats.map((s, i) => (
                  <StatFigure key={i} stat={s} href={s.cite_n ? hrefByN.get(s.cite_n) : undefined}
                              sourceLabel={s.cite_n ? labelByN.get(s.cite_n) : undefined} />
                ))}
              </div>
            </section>
          )}

          {citations.length > 0 && (
            <section>
              <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-700">Sources</p>
              <ol className="space-y-0.5">
                {citations.map(({ n, cite }) => {
                  const href = citeHref(cite);
                  return (
                    <li key={n} className={`-mx-2 flex gap-2.5 rounded-md px-2 py-1.5 text-[13px] leading-relaxed transition-colors ${activeN === n ? "bg-sky-50" : ""}`}>
                      <span className="w-6 shrink-0 text-right font-bold text-sky-600">[{n}]</span>
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
            </section>
          )}

          {streaming && !hasRail && (
            <p className="text-[12.5px] text-slate-400">Sources and figures appear when the answer is complete.</p>
          )}
        </aside>
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

  // The conversation lives in React state only, so any full page reload (a dev-server
  // crash/HMR reload, a refresh, coming back after opening a reference) used to wipe it.
  // Mirror it into sessionStorage so it survives a reload, and restore it on mount.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(CHAT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Message[];
        if (Array.isArray(parsed)) setMessages(parsed.map((m) => ({ ...m, streaming: false })));
      }
    } catch { /* corrupt or unavailable storage: start fresh */ }
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored || busy) return;
    try {
      if (messages.length === 0) sessionStorage.removeItem(CHAT_STORAGE_KEY);
      else sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    } catch { /* storage full or unavailable: skip */ }
  }, [messages, busy, restored]);

  // Auto-send a question passed in via ?q= (the home page's Ask bar) — read straight
  // from window.location rather than useSearchParams so this page needs no Suspense
  // boundary during the hosted static export build.
  useEffect(() => {
    if (!restored) return;
    const q = new URLSearchParams(window.location.search).get("q");
    if (q && q.trim()) {
      window.history.replaceState({}, "", window.location.pathname);
      send(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored]);

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
      if (!res.ok || !res.body) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.error || `Request failed (${res.status})`);
      }

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
        <div className="mx-auto w-11/12 max-w-7xl">
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
                Ask anything grounded in TrendLens&apos;s reports, megatrend dossiers, and ideas.
                Every answer is cited.
              </p>

              <div className="mx-auto mt-9 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {STARTERS.map((q) => (
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
                    <div className="min-w-0 flex-1 pt-0.5">
                      {m.content ? (
                        <AssistantAnswer content={m.content} streaming={m.streaming} />
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
          className="mx-auto flex w-11/12 max-w-7xl items-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 p-1.5 shadow-sm transition focus-within:border-slate-300 focus-within:bg-white focus-within:shadow-md"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about a trend, a report, or an idea…"
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
