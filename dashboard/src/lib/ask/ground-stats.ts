// Server-side check that the figures in an answer's "### Stats" tiles really appear in what the
// tools returned. The prompt already tells the model to quote only tool numbers, but a prompt
// rule is not a guarantee (same lesson as the dash and narration backstops in api/ask/route.ts),
// so a tile whose value can't be found in the tool output is dropped, and an ungrounded delta
// is stripped from an otherwise-grounded tile.

const MULTIPLIER: Record<string, number> = {
  k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, mm: 1e6, b: 1e9, bn: 1e9, billion: 1e9,
};

interface Num { value: number; tol: number }

// "58%" -> 58, "$4.2M" -> 4,200,000, "16 million" -> 16,000,000, "1,200" -> 1200.
// `tol` is half a unit in the last written decimal place, so "58" matches a source "58.3".
function extractNumbers(text: string): Num[] {
  const out: Num[] = [];
  const re = /(\d[\d,]*(?:\.\d+)?)\s?(thousand|million|billion|bn|mm|k|m|b)?(?![a-z])/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[1].replace(/,/g, "");
    const base = parseFloat(raw);
    if (!Number.isFinite(base)) continue;
    const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
    const mult = m[2] ? MULTIPLIER[m[2].toLowerCase()] ?? 1 : 1;
    out.push({ value: base * mult, tol: 0.5 * Math.pow(10, -decimals) * mult });
  }
  return out;
}

export function buildCorpus(text: string): number[] {
  const nums: number[] = [];
  for (const { value } of extractNumbers(text)) {
    nums.push(value);
    // Tools sometimes return a share as a fraction (0.58) where the answer writes 58%.
    if (value > 0 && value <= 10) nums.push(value * 100);
  }
  return nums;
}

// Deltas are mostly prose ("vs. Mar '25", "vs. prior year"), whose bare numbers are dates that
// won't match a source's date format, so only the quantities in them (percentages and $ amounts)
// are checked.
function quantitiesOnly(text: string): string {
  return (text.match(/\$?\d[\d,]*(?:\.\d+)?\s?(?:%|thousand|million|billion|bn|mm|k|m|b)(?![a-z])|\$\d[\d,]*(?:\.\d+)?/gi) ?? []).join(" ");
}

function grounded(text: string, corpus: number[]): boolean {
  const nums = extractNumbers(text);
  // No digits at all (e.g. "Top pick") means there is nothing to verify.
  return nums.every(({ value, tol }) => corpus.some((c) => Math.abs(c - value) <= tol + 1e-9));
}

/** Drops ungrounded stat tiles from the "### Stats" JSON block; returns the rewritten answer. */
export function groundStats(answer: string, corpus: number[]): { answer: string; dropped: string[] } {
  const dropped: string[] = [];
  const heading = answer.match(/###\s*Stats\s*\n?/i);
  if (!heading || heading.index === undefined) return { answer, dropped };
  const afterHeading = answer.slice(heading.index + heading[0].length);
  const fence = afterHeading.match(/```json\s*([\s\S]*?)```/i);
  if (!fence || fence.index === undefined) return { answer, dropped };

  let arr: unknown;
  try { arr = JSON.parse(fence[1]); } catch { return { answer, dropped }; }
  if (!Array.isArray(arr)) return { answer, dropped };

  const kept: unknown[] = [];
  for (const s of arr) {
    if (!s || typeof s !== "object") continue;
    const stat = { ...(s as Record<string, unknown>) };
    const label = String(stat.label ?? "?");
    if (typeof stat.value === "string" && !grounded(stat.value, corpus)) {
      dropped.push(`${label}: ${stat.value}`);
      continue;
    }
    if (typeof stat.delta === "string" && !grounded(quantitiesOnly(stat.delta), corpus)) {
      dropped.push(`${label} delta: ${stat.delta}`);
      delete stat.delta;
      delete stat.direction;
      delete stat.good;
    }
    kept.push(stat);
  }
  if (dropped.length === 0) return { answer, dropped };

  const fenceStart = heading.index + heading[0].length + fence.index;
  const fenceEnd = fenceStart + fence[0].length;
  // Remove the whole Stats section if nothing survived, rather than leave an empty block.
  if (kept.length === 0) {
    const sectionEnd = answer.slice(fenceEnd).search(/\n\s*#{2,3}\s/);
    const end = sectionEnd === -1 ? answer.length : fenceEnd + sectionEnd;
    return { answer: answer.slice(0, heading.index) + answer.slice(end), dropped };
  }
  const newFence = "```json\n" + JSON.stringify(kept) + "\n```";
  return { answer: answer.slice(0, fenceStart) + newFence + answer.slice(fenceEnd), dropped };
}

/** Numbers in Key Takeaways bullets that no tool returned; logged only, never edited out. */
export function ungroundedTakeawayNumbers(takeaways: string[], corpus: number[]): string[] {
  return takeaways.filter((t) => !grounded(t.replace(/\[\d+\]/g, ""), corpus));
}
