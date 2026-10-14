// Mechanical backstop for sentences that describe the model's own retrieval ("the catalog tool
// should be re-run", "my keyword attempts returned no rows"). The prompt forbids them, but a
// new heading like "Where to look next" has slipped past prompt rules and the leading-narration
// stripper before, so any such sentence is removed wherever it appears, along with a heading
// left with nothing under it. Fenced json blocks (Stats/Sources) are never touched.

const PROCESS_SENTENCE =
  /\b(the \w+ tool|(my|our) (keyword|search|query|queries|attempts?)|keyword (search|attempts?)|search (terms?|attempts?)|query terms?|re-?run(ning)? the|returned no (rows|results)|tool (calls?|results?))\b/i;

export function stripProcessSentences(text: string): string {
  let inFence = false;
  const kept: string[] = [];
  for (const line of text.split("\n")) {
    if (/^\s*```/.test(line)) { inFence = !inFence; kept.push(line); continue; }
    if (inFence || /^\s*#{1,6}\s/.test(line) || line.trim() === "") { kept.push(line); continue; }
    const sentences = line.split(/(?<=[.!?])\s+/).filter((s) => !PROCESS_SENTENCE.test(s));
    if (sentences.length === 0) continue; // the whole line was process talk
    kept.push(sentences.join(" "));
  }
  let out = kept.join("\n");
  // A heading with nothing under it (next heading or end of text follows) is dropped.
  for (let guard = 0; guard < 5; guard++) {
    // `(?![\s\S])` is a true end-of-text; a bare `$` under the m flag also matches at every
    // blank line and would wrongly drop any heading that has a blank line after it.
    const next = out.replace(/^#{1,6}[^\n]*\n(?:[ \t]*\n)*(?=#{1,6}\s|\s*(?![\s\S]))/gm, "");
    if (next === out) break;
    out = next;
  }
  return out.replace(/\n{3,}/g, "\n\n");
}
