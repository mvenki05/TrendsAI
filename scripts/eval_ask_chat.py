"""
TrendLens — Ask TrendLens regression eval.

Every fix to dashboard/src/lib/ask/prompt.ts this session was validated against ONE
question that happened to trigger the bug. That proves the fix works for that case,
not that it generalizes — a prompt instruction can easily hold for the exact wording
that surfaced the bug and drift for a differently-shaped question. This script is the
actual answer to "how do we know other questions will be better answered": a fixed,
diverse batch of real questions run through the live /api/ask endpoint, each checked
mechanically against every rule the prompt currently asserts.

Re-run this after ANY prompt.ts change — not just the one case that motivated it.

Usage:
    python scripts/eval_ask_chat.py                  # needs the dev server running on :3000
    python scripts/eval_ask_chat.py --base http://localhost:3000
"""

import argparse
import json
import re
import sys
import urllib.request

QUESTIONS = [
    "What do you suggest to improve gut health?",
    "What's driving Tyson's #1 megatrend, The Protein Era?",
    "What's fueling The Value Recalibration?",
    "Is demand for protein snacks actually rising?",
    "What's Tyson's white space in clean label?",
    "How is GLP-1 changing portion sizes?",
    "What's behind Functional Everything?",
    "What's fueling private label growth?",
    "Which megatrend is growing fastest right now?",
    "What Tyson products already exist in frozen value-added poultry?",
]

DASH_RE = re.compile(r"[–—]")
RAW_ID_RE = re.compile(r"\brep_[a-z0-9]+\b", re.IGNORECASE)
PROCESS_NARRATION_RES = [
    re.compile(r"\bI have the\b", re.IGNORECASE),
    re.compile(r"\bthis gives me\b", re.IGNORECASE),
    re.compile(r"\blet me check\b", re.IGNORECASE),
    re.compile(r"\bbased on my search\b", re.IGNORECASE),
    re.compile(r"\bI searched\b", re.IGNORECASE),
    re.compile(r"\bmy tools\b", re.IGNORECASE),
    # The scope-disclaimer-then-pivot pattern ("I can't give personal health advice, but...")
    # is the same self-narration as the above, just framed as a limitation instead of a process
    # note — caught a live example of this on "what do you suggest to improve gut health?".
    re.compile(r"\bI can'?t give (personal|medical|dietary)\b", re.IGNORECASE),
    re.compile(r"\bonly answers questions about\b", re.IGNORECASE),
    re.compile(r"\bwhat I can tell you is\b", re.IGNORECASE),
]
PLACEHOLDER_HEADING_RE = re.compile(r"^#{2,3}\s*(Detail|Detailed Answer|Overview|Analysis)\s*$", re.IGNORECASE | re.MULTILINE)
BRACKET_RE = re.compile(r"\[(\d+)\]")


def ask(base: str, question: str) -> str:
    req = urllib.request.Request(
        f"{base}/api/ask",
        data=json.dumps({"question": question, "history": []}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    full = ""
    with urllib.request.urlopen(req, timeout=90) as resp:
        buf = b""
        for chunk in resp:
            buf += chunk
            while b"\n\n" in buf:
                line, buf = buf.split(b"\n\n", 1)
                line = line.decode("utf-8", errors="replace").strip()
                if not line.startswith("data:"):
                    continue
                try:
                    obj = json.loads(line[5:].strip())
                except Exception:
                    continue
                if "delta" in obj:
                    full += obj["delta"]
    return full


def split_sections(full: str) -> tuple[str, list, list]:
    """(prose_only, stats, sources) — prose has the Stats/Sources fenced blocks removed."""
    stats, sources = [], []
    prose = full
    m = re.search(r"###\s*Stats\s*\n```json\s*\n(.*?)\n```", full, re.S)
    if m:
        try:
            stats = json.loads(m.group(1))
        except Exception:
            stats = []
        prose = prose.replace(m.group(0), "")
    m = re.search(r"###\s*Sources\s*\n```json\s*\n(.*?)\n```", full, re.S)
    if m:
        try:
            sources = json.loads(m.group(1))
        except Exception:
            sources = []
        prose = prose.replace(m.group(0), "")
    return prose, stats, sources


def check(question: str, full: str) -> list[str]:
    violations = []
    if not full.strip():
        return ["EMPTY RESPONSE"]

    prose, stats, sources = split_sections(full)

    if DASH_RE.search(prose):
        violations.append(f"em/en dash found in prose: ...{DASH_RE.search(prose).string[max(0,DASH_RE.search(prose).start()-30):DASH_RE.search(prose).start()+30]}...")

    if RAW_ID_RE.search(prose):
        violations.append(f"raw report_id leaked in prose: {RAW_ID_RE.search(prose).group(0)}")

    for pat in PROCESS_NARRATION_RES:
        if pat.search(prose):
            violations.append(f"process-narration phrase found: {pat.pattern}")

    if PLACEHOLDER_HEADING_RE.search(prose):
        violations.append(f"placeholder heading found: {PLACEHOLDER_HEADING_RE.search(prose).group(0)!r}")

    for s in stats:
        label = s.get("label", "")
        if len(label.split()) > 8:
            violations.append(f"stat label over 8 words ({len(label.split())}): {label!r}")
        delta = s.get("delta")
        if delta and not delta.startswith("vs. "):
            violations.append(f"stat delta doesn't start with 'vs. ': {delta!r}")
        if "term" in s and not isinstance(s.get("term"), str):
            violations.append(f"stat has non-string term: {s.get('term')!r}")

    used_ns = {int(n) for n in BRACKET_RE.findall(prose)}
    source_ns = {s.get("n") for s in sources}
    missing = used_ns - source_ns
    if missing:
        violations.append(f"[n] brackets with no matching Sources entry: {sorted(missing)}")
    for s in sources:
        if s.get("kind") == "report" and not s.get("report_id"):
            violations.append(f"Sources entry kind=report with no report_id: {s}")
        if s.get("kind") == "web" and not s.get("url"):
            violations.append(f"Sources entry kind=web with no url: {s}")

    return violations


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--base", default="http://localhost:3000")
    args = ap.parse_args()

    total_violations = 0
    for q in QUESTIONS:
        print(f"\n--- {q}")
        try:
            full = ask(args.base, q)
        except Exception as e:
            print(f"  REQUEST FAILED: {e}")
            total_violations += 1
            continue
        violations = check(q, full)
        if violations:
            total_violations += len(violations)
            for v in violations:
                print(f"  FAIL: {v}")
        else:
            print("  OK")

    print(f"\n{'='*60}\n{total_violations} total violations across {len(QUESTIONS)} questions")
    sys.exit(1 if total_violations else 0)


if __name__ == "__main__":
    main()
