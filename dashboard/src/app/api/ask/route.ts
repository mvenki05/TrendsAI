import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { rateLimit } from "@/lib/rate-limit";
import { stripProcessSentences } from "@/lib/ask/strip-process";
import { query, DATASET, PROJECT_ID } from "@/lib/bigquery";
import { chatCompletion, type ChatMessage } from "@/lib/ask/litellm";
import { TOOL_DEFS, runTool } from "@/lib/ask/tools";
import { SYSTEM_PROMPT } from "@/lib/ask/prompt";
import { parseAnswerCitations } from "@/lib/ask/parse-citations";
import { buildCorpus, groundStats, ungroundedTakeawayNumbers } from "@/lib/ask/ground-stats";

const T = `\`${PROJECT_ID}.${DATASET}`;
const MAX_TOOL_ROUNDS = 7;

interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

// Mechanical backstop for the prompt's "never narrate your process" rule, same reason as the
// dash ban above: the model still occasionally opens with a leaked internal note ("I have the
// full dossier. That's the core of the answer."). A well-formed answer starts at "## Key
// Takeaways", so anything before it is dropped; otherwise leading sentences that talk about the
// model's own retrieval/process are peeled off one at a time.
const NARRATION_START =
  /^(I have|I've|I now have|I'll|I will|I can now|I found|I should|I need to|Let me|Now,? (I|let)|Based on (my|the) (search|tool|result)|Looking at|After (searching|reviewing|checking)|That's the core|This (gives|is) (me|the core)|Here'?s what I|Okay|Alright|Great|Perfect)\b/i;

function stripNarration(text: string): string {
  const trimmed = text.trimStart();
  const kt = trimmed.search(/^##\s*Key Takeaways/im);
  if (kt > 0) return trimmed.slice(kt);
  if (kt === 0) return trimmed;

  let rest = trimmed;
  for (let guard = 0; guard < 6; guard++) {
    const m = rest.match(/^([^\n]*?[.!?:])(\s+|$)/);
    if (!m || !NARRATION_START.test(m[1].trim())) break;
    rest = rest.slice(m[0].length);
  }
  return rest;
}

// Runs the agentic tool-calling loop (see src/lib/ask/tools.ts) until Claude stops
// requesting tools or the round cap is hit, then returns its final answer text.
async function runAskLoop(
  question: string,
  history: HistoryTurn[],
): Promise<{ answer: string; toolsUsed: string[]; toolText: string }> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((h): ChatMessage => ({ role: h.role, content: h.content })),
    { role: "user", content: question },
  ];
  const toolsUsed = new Set<string>();
  // Everything the tools returned, kept so figures in the answer can be checked against it.
  const toolChunks: string[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const { message, finishReason } = await chatCompletion(messages, { tools: TOOL_DEFS });
    messages.push(message);

    if (finishReason !== "tool_calls" || !message.tool_calls?.length) {
      return { answer: message.content ?? "", toolsUsed: [...toolsUsed], toolText: toolChunks.join(" ") };
    }

    for (const call of message.tool_calls) {
      toolsUsed.add(call.function.name);
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* leave empty */ }
      let result: unknown;
      try { result = await runTool(call.function.name, args); }
      catch (err) { result = { error: err instanceof Error ? err.message : String(err) }; }
      const toolContent = JSON.stringify(result);
      toolChunks.push(toolContent);
      messages.push({ role: "tool", tool_call_id: call.id, name: call.function.name, content: toolContent });
    }
  }

  // Hit the round cap while the model still wanted to call tools — force a final
  // answer from whatever context has been gathered so far.
  const { message } = await chatCompletion(messages, {});
  return { answer: message.content ?? "", toolsUsed: [...toolsUsed], toolText: toolChunks.join(" ") };
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

const MAX_BODY_BYTES = 200_000;
const MAX_QUESTION_CHARS = 1500;
const MAX_HISTORY_TURNS = 20;
const MAX_HISTORY_CHARS = 12_000;

export async function POST(req: Request) {
  // Each question fans out into up to 7 LLM rounds plus BigQuery searches, so cap per client.
  const limited = rateLimit(req, "ask", 20, 60_000);
  if (limited) return limited;

  const declaredLength = Number(req.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request too large" }, { status: 413 });
  }

  let body: { question?: unknown; history?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return NextResponse.json({ error: "Missing question" }, { status: 400 });
  if (question.length > MAX_QUESTION_CHARS) {
    return NextResponse.json({ error: `Question too long (max ${MAX_QUESTION_CHARS} characters)` }, { status: 400 });
  }

  // Roles limited to user/assistant (never "system" or "tool"), only the most recent turns kept,
  // and each turn's text capped, so the client can't inflate the prompt or inject a system turn.
  const history: HistoryTurn[] = Array.isArray(body.history)
    ? body.history
        .filter(
          (h): h is HistoryTurn => !!h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string",
        )
        .slice(-MAX_HISTORY_TURNS)
        .map((h) => ({ role: h.role, content: h.content.slice(0, MAX_HISTORY_CHARS) }))
    : [];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        const { answer, toolsUsed, toolText } = await runAskLoop(question, history);
        const cleaned = stripBannedDashes(stripProcessSentences(stripNarration(answer)));
        // Drop stat tiles whose figures no tool actually returned; takeaway figures are only logged.
        const corpus = buildCorpus(toolText);
        const grounding = groundStats(cleaned, corpus);
        if (grounding.dropped.length) console.warn("[ask] ungrounded stat figures dropped:", grounding.dropped);
        const loose = ungroundedTakeawayNumbers(parseAnswerCitations(grounding.answer).takeaways, corpus);
        if (loose.length) console.warn("[ask] takeaways with figures not found in tool output:", loose);
        const enrichedAnswer = grounding.answer;

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
        // Full detail stays server-side (console + chat_logs); the browser only gets a trace ID
        // so internals (gateway URLs, SQL errors, quota text) never reach the client.
        const message = err instanceof Error ? err.message : String(err);
        const traceId = randomUUID().slice(0, 8);
        console.error(`[ask ${traceId}]`, err);
        send({ error: `please try again (ref ${traceId})` });
        await logChat({ question, answer: "", toolsUsed: [], error: `[${traceId}] ${message}` });
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
