# TrendPulse Toolkit Guide

Everything below was adapted from [everything-claude-code](https://github.com/affaan-m/everything-claude-code) and customized for this project. This guide explains what each tool is, when to use it, and how it fits into the TrendPulse development workflow.

---

## Agents

Agents are specialized subprocesses you can delegate work to. They run autonomously and return results.

### `agents/planner.md` — Planning Agent

**What it does:** Creates detailed, phased implementation plans before any code is written. Analyzes requirements, identifies dependencies, assesses risks, and produces a step-by-step build plan with exact file paths.

**When to use it:**
- Before starting any new pipeline module (e.g., "build the Reddit ingestion script")
- Before making changes that touch multiple files or BigQuery tables
- Before adding a new data source to the system
- Before modifying or adding Claude prompt chains
- Any time the approach isn't immediately obvious

**How to invoke:** Use the `/plan` command or ask Claude Code to plan before implementing.

**Example triggers:**
- "I need to add TikTok as a data source"
- "Let's build the trend detection engine"
- "How should we structure the opportunity sizing module?"

---

### `agents/python-reviewer.md` — Python Code Reviewer

**What it does:** Reviews Python code changes for security issues, code quality, PEP 8 compliance, type hints, and TrendPulse-specific rules (BigQuery injection prevention, rate-limit compliance, config separation).

**When to use it:**
- After completing any Python module or significant code change
- Before merging or finalizing a feature
- When refactoring existing code
- When you want a second pass on code quality

**How to invoke:** Ask Claude Code to review the code, or invoke after finishing a coding task.

**Example triggers:**
- "Review the ingestion script I just wrote"
- "Check this module for security issues"
- After any coding session that produced 50+ lines of new Python

**TrendPulse-specific checks it performs:**
- BigQuery queries use parameterized queries (no f-strings in SQL)
- pytrends calls have rate limiting and backoff
- Config values come from `config/*.yaml`, not hardcoded
- Ingestion scripts are idempotent (safe to re-run)
- Logging uses `logging` module, not `print()`

---

## Commands

Commands are slash-invoked workflows that guide a specific process.

### `commands/plan.md` — /plan

**What it does:** Invokes the planner agent to create an implementation plan. Waits for your confirmation before any code is written.

**When to use it:** Same triggers as the planner agent above. This is the shortcut to invoke it.

**How to invoke:** `/plan [description of what you want to build]`

**Example:**
```
/plan Build the Google Trends ingestion script that pulls weekly data for all 80 terms and writes to BigQuery
```

---

### `commands/prompt-optimize.md` — /prompt-optimize

**What it does:** Analyzes a Claude API prompt (used in our intelligence layer) and outputs an optimized version. Does NOT execute the prompt — advisory only.

**When to use it:**
- When writing a new prompt chain (trend detection, insight extraction, sizing, scoring, brief generation)
- When a prompt chain is producing inconsistent or low-quality output
- When you want to reduce token usage without losing quality
- Before finalizing any prompt that will run in production weekly

**How to invoke:** `/prompt-optimize [paste your prompt here]`

**What it checks:**
- Role definition (does the prompt tell Claude what role it's playing?)
- Input/output format clarity (is structured output specified?)
- Grounding context (does it include brand portfolio, keyword clusters, scoring rubric?)
- Guardrails against hallucination
- Edge case handling (missing data, low-confidence results)
- Token efficiency

**Example:**
```
/prompt-optimize You are a food trend analyst. Given the following Google Trends data, identify which terms are accelerating...
```

---

## Rules

Rules are always-active guidelines that apply whenever you're working in matching files. They don't need to be invoked — they're automatically relevant when editing Python files.

### `rules/python-security.md`

**What it enforces:**
- Secrets loaded from environment variables via `python-dotenv`, never hardcoded
- BigQuery queries always use parameterized queries (with `QueryJobConfig` and `ScalarQueryParameter`)
- External input (Reddit posts, API responses, CSV uploads) is validated before storage
- Regular `bandit` and `pip-audit` scans

**When it matters most:**
- Writing any BigQuery query
- Handling API keys or credentials
- Processing Reddit post content (user-generated text)
- Adding new dependencies

---

### `rules/python-testing.md`

**What it enforces:**
- pytest as the testing framework
- Test markers: `@pytest.mark.unit`, `@pytest.mark.integration`, `@pytest.mark.slow`
- Shared fixtures in `tests/conftest.py` (mock BigQuery client, sample trends data)
- 80%+ coverage target on `src/ingestion/` and `src/scoring/`
- Prompt chain tests validate output structure (valid JSON, required fields, score ranges), not exact text

**When it matters most:**
- After writing any new module — write tests
- When the pipeline produces unexpected output — write a regression test
- Before declaring a feature "done"

---

### `rules/python-patterns.md`

**What it enforces:**
- Type hints on all function signatures
- Dataclasses for structured data (`TrendSignal`, `OpportunityScore`)
- Config loading from `config/*.yaml` via a standard pattern
- `logging` module instead of `print()`
- `tenacity` retry decorator for pytrends and external API calls
- Generator pattern for batching terms
- Proper import order (stdlib → third-party → local)

**When it matters most:**
- Writing any new function or class
- Structuring data that flows between pipeline stages
- Handling pytrends rate limits or API failures

---

## Skills

Skills provide domain-specific knowledge and workflows.

### `skills/market-research.md`

**What it does:** Guides structured market research for food industry trends — opportunity sizing, competitive analysis, consumer behavior research. Ensures research output is decision-oriented with source attribution.

**When to use it:**
- When sizing a trend opportunity for an opportunity brief (e.g., "How big is the GLP-1 friendly frozen meal market?")
- When analyzing competitor activity in a food segment
- When researching consumer behavior shifts to enrich a trend signal
- When preparing the monthly opportunity report

**How to invoke:** Ask Claude Code to do market research, or reference this skill when doing trend deep-dives.

**Output structure it enforces:**
1. Executive summary
2. Key findings (sourced)
3. Implications for Tyson
4. Risks and caveats
5. Recommendation (act / watch / skip)
6. Sources

**Example triggers:**
- "Research the competitive landscape for high-protein frozen meals"
- "Size the Indian flavor opportunity for Tyson's frozen chicken line"
- "What's driving the cottage cheese trend and is it structural?"

---

## Contexts

Contexts set behavioral modes for how Claude Code should approach work.

### `contexts/research.md`

**What it does:** Puts Claude Code into exploration mode — read widely, ask questions, document findings, don't write code until understanding is clear.

**When to use it:**
- At the start of a new data source investigation
- When debugging unexpected pipeline behavior
- When exploring whether a feature is feasible before planning it
- When you say "let's research..." or "let's investigate..."

**Behavioral shift:**
- Favors reading and searching over writing code
- Documents findings as it goes
- Forms hypotheses and verifies with evidence
- Outputs findings first, recommendations second

---

## Quick Reference: When to Use What

| Situation | Tool to Use |
|---|---|
| Starting a new module | `/plan` → planner agent |
| Writing a new Claude prompt chain | `/prompt-optimize` after drafting |
| Finished writing Python code | python-reviewer agent |
| Writing any BigQuery query | python-security rules (auto-applied) |
| Adding tests | python-testing rules (auto-applied) |
| Writing any Python function | python-patterns rules (auto-applied) |
| Sizing a trend opportunity | market-research skill |
| Investigating something before building | research context |
| Prompt chain output is inconsistent | `/prompt-optimize` to refine |
| Adding a new data source | `/plan` first, then build |
| Preparing an opportunity brief | market-research skill + scoring modules |

---

## Source Attribution

All tools above were adapted from the [everything-claude-code](https://github.com/affaan-m/everything-claude-code) repository by Affaan M. Original patterns were customized for TrendPulse's specific stack (Python, BigQuery, Claude API, Streamlit) and domain (Tyson Foods food trend intelligence).
