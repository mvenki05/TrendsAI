---
description: Create a step-by-step implementation plan before writing code. Invokes the planner agent. WAIT for user confirmation before proceeding.
---

# /plan

Create a comprehensive implementation plan before writing any code.

## When to Use

- Starting a new pipeline module (ingestion, intelligence, scoring, briefs, dashboard)
- Making changes that touch multiple files or BigQuery tables
- Adding a new data source
- Modifying the prompt chains
- Any work where the approach isn't obvious

## How It Works

1. **Restate requirements** — clarify what needs to be built
2. **Identify pipeline impact** — which stages are affected (ingestion → intelligence → scoring → briefs → dashboard)
3. **Break into phases** — specific, actionable steps with file paths
4. **Assess risks** — rate limits, API costs, data quality issues
5. **Present plan** — WAIT for explicit user confirmation before coding

## CRITICAL

The planner will NOT write any code until you explicitly confirm with "yes" or "proceed".

$ARGUMENTS
