// Thin client for the LiteLLM gateway's OpenAI-compatible /v1/chat/completions
// endpoint — this is how TrendLens reaches Claude with no direct Anthropic key
// (see CLAUDE.md "CRITICAL CONSTRAINT — no local ANTHROPIC_API_KEY"). Plain
// fetch — no SDK needed since the gateway speaks standard OpenAI JSON.

const BASE_URL = process.env.LITELLM_BASE_URL;
const API_KEY = process.env.LITELLM_API_KEY;
const MODEL = process.env.LITELLM_CHAT_MODEL || "claude-4-8-opus";

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

function assertConfigured() {
  if (!BASE_URL || !API_KEY) {
    throw new Error("LiteLLM is not configured — set LITELLM_BASE_URL and LITELLM_API_KEY in dashboard/.env.local");
  }
}

// Minimal shape of what we read from the gateway's response — not the full OpenAI spec.
interface ChatCompletionResponse {
  choices?: { message: ChatMessage; finish_reason: string }[];
}

export async function chatCompletion(
  messages: ChatMessage[],
  opts?: { tools?: unknown[]; maxTokens?: number },
): Promise<{ message: ChatMessage; finishReason: string }> {
  assertConfigured();
  const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages,
      ...(opts?.tools ? { tools: opts.tools, tool_choice: "auto" } : {}),
      // Answers carry a Key Takeaways section and an optional Stats block on top of the
      // detailed body and Sources JSON. Long citation lists are the real driver of length
      // here — a single web citation's URL (e.g. a Google News redirect link) can run
      // 100-150+ chars, and a well-cited answer can carry a dozen of them — so even 2200
      // was still getting cut off mid-JSON on richly-cited answers, silently zeroing out
      // citations client-side. parse-citations.ts salvages whatever citations parse
      // as complete before a cutoff, but a higher ceiling means hitting one at all is rarer.
      max_tokens: opts?.maxTokens ?? 3200,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LiteLLM request failed: ${res.status} ${text.slice(0, 500)}`);
  }
  const data = (await res.json()) as ChatCompletionResponse;
  const choice = data.choices?.[0];
  if (!choice) throw new Error("LiteLLM returned no choices");
  return { message: choice.message, finishReason: choice.finish_reason };
}
