import { NextResponse } from "next/server";
import { query, DATASET, PROJECT_ID } from "@/lib/bigquery";
import { chatCompletion, type ChatMessage } from "@/lib/ask/litellm";
import { TOOL_DEFS, runTool } from "@/lib/ask/tools";
import { SYSTEM_PROMPT } from "@/lib/ask/prompt";
import { parseAnswerCitations } from "@/lib/ask/parse-citations";

const T = `\`${PROJECT_ID}.${DATASET}`;
const MAX_TOOL_ROUNDS = 7;

interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// search_trends_numeric rows carry a raw interest_series JSON string purely so this route
// can pull real sparkline data out of them — collects term -> weekly-interest arrays keyed
// by lowercased term so enrichStatsWithSeries can match them against the model's own answer.
function collectTrendSeries(result: unknown, into: Record<string, number[]>) {
  if (!result || typeof result !== "object") return;
  const r = result as Record<string, unknown>;
  const rows = [
    ...(Array.isArray(r.from_report_taxonomy) ? r.from_report_taxonomy : []),
    ...(Array.isArray(r.on_demand_measurements) ? r.on_demand_measurements : []),
  ] as Record<string, unknown>[];
  for (const row of rows) {
    if (typeof row?.term !== "string" || typeof row?.interest_series !== "string") continue;
    try {
      const series = JSON.parse(row.interest_series);
      if (Array.isArray(series) && series.length > 1 && series.every((n) => typeof n === "number")) {
        into[row.term.toLowerCase().trim()] = series;
      }
    } catch {
      /* malformed series JSON — skip */
    }
  }
}

// Strips interest_series back off before a search_trends_numeric result goes into the LLM's
// own conversation — the model only needs current_interest/yoy_growth, not a 52-number array.
function withoutSeries(result: unknown): unknown {
  if (!result || typeof result !== "object") return result;
  const strip = (rows: unknown) =>
    Array.isArray(rows) ? rows.map((row) => { const { interest_series: _interest_series, ...rest } = row ?? {}; return rest; }) : rows;
  const r = result as Record<string, unknown>;
  return { ...r, from_report_taxonomy: strip(r.from_report_taxonomy), on_demand_measurements: strip(r.on_demand_measurements) };
}

// Splices real trend-series arrays into the model's own "### Stats" json block, matching
// each stat's declared "term" (see prompt.ts) against series gathered during the tool loop.
// The model never sees or writes these numbers itself — this is a pure server-side merge.
function enrichStatsWithSeries(answer: string, trendSeries: Record<string, number[]>): string {
  if (Object.keys(trendSeries).length === 0) return answer;
  const heading = answer.match(/###\s*Stats\s*\n?/i);
  if (!heading || heading.index === undefined) return answer;
  const afterHeading = answer.slice(heading.index + heading[0].length);
  const fence = afterHeading.match(/```json\s*([\s\S]*?)```/i);
  if (!fence || fence.index === undefined) return answer;

  let arr: unknown;
  try { arr = JSON.parse(fence[1]); } catch { return answer; }
  if (!Array.isArray(arr)) return answer;

  const enriched = arr.map((s) => {
    if (s && typeof s === "object" && typeof (s as Record<string, unknown>).term === "string") {
      const series = trendSeries[((s as Record<string, unknown>).term as string).toLowerCase().trim()];
      if (series) return { ...s, series };
    }
    return s;
  });

  const fenceStart = heading.index + heading[0].length + fence.index;
  const fenceEnd = fenceStart + fence[0].length;
  const newFence = "```json\n" + JSON.stringify(enriched) + "\n```";
  return answer.slice(0, fenceStart) + newFence + answer.slice(fenceEnd);
}

// Mechanical backstop for the prompt's em/en-dash ban: a regression eval (scripts/
// eval_ask_chat.py) across 10 diverse questions found the model still writes one through
// occasionally (e.g. quoting a report title verbatim: "Mintel's Prepared Meals – US –
// 2026"), so prompt compliance alone isn't reliable enough — this guarantees it rather
// than just requesting it. Safe to run across the whole answer including the Stats/
// Sources JSON blocks: a dash inside a JSON string value is just a character, not syntax.
function stripBannedDashes(text: string): string {
  return text.replace(/\s*[–—]\s*/g, ", ");
}

// Runs the agentic tool-calling loop (see src/lib/ask/tools.ts) until Claude stops
// requesting tools or the round cap is hit, then returns its final answer text.
async function runAskLoop(
  question: string,
  history: HistoryTurn[],
): Promise<{ answer: string; toolsUsed: string[]; trendSeries: Record<string, number[]> }> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((h): ChatMessage => ({ role: h.role, content: h.content })),
    { role: "user", content: question },
  ];
  const toolsUsed = new Set<string>();
  const trendSeries: Record<string, number[]> = {};

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const { message, finishReason } = await chatCompletion(messages, { tools: TOOL_DEFS });
    messages.push(message);

    if (finishReason !== "tool_calls" || !message.tool_calls?.length) {
      return { answer: message.content ?? "", toolsUsed: [...toolsUsed], trendSeries };
    }

    for (const call of message.tool_calls) {
      toolsUsed.add(call.function.name);
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* leave empty */ }
      let result: unknown;
      try { result = await runTool(call.function.name, args); }
      catch (err) { result = { error: err instanceof Error ? err.message : String(err) }; }
      if (call.function.name === "search_trends_numeric") {
        collectTrendSeries(result, trendSeries);
        result = withoutSeries(result);
      }
      messages.push({ role: "tool", tool_call_id: call.id, name: call.function.name, content: JSON.stringify(result) });
    }
  }

  // Hit the round cap while the model still wanted to call tools — force a final
  // answer from whatever context has been gathered so far.
  const { message } = await chatCompletion(messages, {});
  return { answer: message.content ?? "", toolsUsed: [...toolsUsed], trendSeries };
}

async function logChat(entry: { question: string; answer: string; toolsUsed: string[]; error?: string }) {
  const { citations } = parseAnswerCitations(entry.answer);
  try {
    await query(
      `INSERT INTO ${T}.chat_logs\` (chat_id, question, answer, tools_used, citation_count, error, created_at)
       VALUES (GENERATE_UUID(), @question, @answer, @tools_used, @citation_count, @error, CURRENT_TIMESTAMP())`,
      {
        // BigQuery's Node client needs an explicit `types` option to send a real NULL
        // parameter — simplest to just use "" as the "nothing here" sentinel instead.
        question: entry.question,
        answer: entry.answer,
        tools_used: entry.toolsUsed,
        citation_count: citations.length,
        error: entry.error ?? "",
      },
    );
  } catch (err) {
    console.error("chat_logs insert failed:", err);
  }
}

export async function POST(req: Request) {
  let body: { question?: unknown; history?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return NextResponse.json({ error: "Missing question" }, { status: 400 });

  const history: HistoryTurn[] = Array.isArray(body.history)
    ? body.history.filter(
        (h): h is HistoryTurn => !!h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string",
      )
    : [];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        const { answer, toolsUsed, trendSeries } = await runAskLoop(question, history);
        const enrichedAnswer = enrichStatsWithSeries(stripBannedDashes(answer), trendSeries);

        // Simulated token-by-token streaming: the loop above already fully generated
        // the answer (it needed the complete text to decide whether more tool calls
        // were needed), so we chunk it out here rather than paying for a second,
        // possibly-different generation just to get real streaming.
        const CHUNK = 5;
        for (let i = 0; i < enrichedAnswer.length; i += CHUNK) {
          send({ delta: enrichedAnswer.slice(i, i + CHUNK) });
          await sleep(10);
        }
        send({ done: true, toolsUsed });

        await logChat({ question, answer: enrichedAnswer, toolsUsed });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send({ error: message });
        await logChat({ question, answer: "", toolsUsed: [], error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
