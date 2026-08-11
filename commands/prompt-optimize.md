---
description: Analyze a Claude prompt chain and output an optimized version. Use when writing or refining the trend detection, insight extraction, sizing, or scoring prompts. Advisory only — does not execute.
---

# /prompt-optimize

Analyze and optimize a Claude API prompt for the TrendPulse intelligence pipeline.

## What This Command Does

1. **Classify the prompt's purpose** — trend detection, insight extraction, opportunity sizing, portfolio scoring, or brief generation
2. **Check for missing context** — is the prompt missing keyword cluster info, brand portfolio context, scoring weights, or output format specs?
3. **Evaluate structure** — is the prompt clear, specific, and structured for consistent JSON/structured output?
4. **Optimize** — output an improved version with better instructions, examples, and guardrails

## Analysis Checklist

For every TrendPulse prompt, verify:

- [ ] **Role definition** — Does the prompt tell Claude what role it's playing? (e.g., "You are a food trend analyst...")
- [ ] **Input format** — Is the input data format clearly described? (e.g., "You will receive a JSON object with...")
- [ ] **Output format** — Is the expected output format specified with an example? (JSON schema, markdown template, etc.)
- [ ] **Grounding context** — Does it include relevant context? (Tyson brand portfolio, keyword clusters, scoring rubric)
- [ ] **Guardrails** — Does it prevent hallucination? (e.g., "Only reference data provided. Do not invent statistics.")
- [ ] **Edge cases** — Does it handle missing data, ambiguous signals, or low-confidence results?
- [ ] **Token efficiency** — Is the prompt concise without losing clarity? Can any sections be moved to a system prompt?

## Output Format

### Diagnosis
- Strengths of the current prompt
- Issues found (with impact and fix)
- Missing context that should be added

### Optimized Prompt
The full rewritten prompt, ready to use as a constant string in the Python module.

### Rationale
What was changed and why.

## CRITICAL

Do NOT execute the prompt. Output ONLY the analysis and optimized version.
This command is for prompt engineering iteration, not for running the pipeline.

## Example Usage

```
/prompt-optimize [paste your trend detection prompt here]
```
