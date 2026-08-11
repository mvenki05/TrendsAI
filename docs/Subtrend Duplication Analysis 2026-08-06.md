# Subtrend Duplication Analysis — Megatrend Codex

**Date:** 2026-08-06 · **Scope:** all 75 subtrends across the 10 canonical megatrend dossiers
**Method:** every cross-megatrend subtrend pair scored on name similarity (token overlap) and shared evidence items; 8 candidate pairs surfaced, each judged individually.

## Headline

Duplication in the Codex is **minimal and localized**: 1 true duplicate, 4 legitimate thematic overlaps
best handled with cross-links, and 3 pairs that are fine as-is. The clustering is fundamentally healthy —
the one genuine hotspot is **GLP-1**, whose influence bleeds into neighboring megatrends.

## Findings & recommended actions

### 🔴 True duplicate — recommend MERGE (1)

**1. [Meal/Snack Blur] "GLP-1 Rewrites Appetite and Family Mealtime" ↔ [GLP-1] "Family Meals in the GLP-1 Era"**
Same phenomenon (GLP-1 reshaping household mealtimes), 25% shared evidence ("eats less due to reduced
appetite", "mealtime as emotional connection").
**Action:** merge the blur version's unique evidence into the GLP-1 dossier's subtrend; in Meal/Snack Blur
replace it with a one-line pointer ("see GLP-1 → Family Meals"). GLP-1 is the canonical home — it owns the
causal driver.

### 🟡 Legitimate overlap — recommend CROSS-LINK, keep both (4)

**2. [Functional Nutrition] "GLP-1-Era Nutrition" ↔ the GLP-1 megatrend broadly**
Different lens on the same driver: functional nutrition looks at *what "healthy" now means*; GLP-1 owns
adoption/behavior. Keep both, add a "related megatrend" cross-link.

**3. [Protein] "Viral Protein-Maximizing Meal Culture" ↔ [Social] "Viral Dish-to-Product Pipeline"**
Both cite boy kibble etc., but protein = the *nutrition culture*, social = the *TikTok-to-shelf mechanism*.
Keep both; cross-link. (Optional: keep shared dish examples only in Social.)

**4. [Protein] "What Wins on Protein Occasions" ↔ [Meal/Snack Blur] "Dinner Holds as the Protein-Centered Social Anchor"**
Both draw on occasion data ("seeks protein at dinner"). Different questions (what wins vs. which daypart
holds). Keep; cross-link.

**5. [Convenience] "Right-Sized, Solo & Snackified Eating" ↔ [Meal/Snack Blur] "Moment-Right, Daypart-Tailored Eating"**
Adjacent but distinct (portion right-sizing vs. daypart tailoring). Keep; cross-link.

### 🟢 Fine as-is — no action (3)

**6. [Meal/Snack Blur GLP-1 subtrend] ↔ [GLP-1] "Grocers Racing to Own the GLP-1 Shopper"** — shared
"protein"/"fiber" chips are generic; resolves itself once #1 is merged.
**7. [Clean Label] "Fresh Meat Claims & Certification Scrutiny" ↔ [GLP-1] "Fresh Meat/Seafood as an Advantaged Category"** —
same category, unrelated phenomena (claims scrutiny vs. GLP-1 advantage).
**8. [Protein] "Protein-ification of the Store" ↔ [Conscious Eating] "Hybrids 2.0"** — two shared hybrid-product
examples; each subtrend's thesis is distinct.

## Recommended next steps

1. Apply the one merge (#1) at the next Codex refresh — it's a dossier-JSON edit, no re-synthesis needed.
2. Add a lightweight "Related megatrends" chip row to dossiers covering #2–#5 (pure UI + small JSON addition).
3. Re-run this analysis after each batch of new reports (script: session scratchpad `dup_analysis.py`;
   consider promoting to `scripts/` if run regularly).

**Why so little duplication?** The canon.json clustering assigns each source megatrend to exactly one
canonical home, so overlap only enters through subtrend-level synthesis — and GLP-1, as the newest
cross-cutting force, is exactly where you'd expect it.
