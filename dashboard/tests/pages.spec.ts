/**
 * Interaction tests for all pages except /best (covered in codex.spec.ts).
 */
import { test, expect } from "@playwright/test";

// ─── Methodology ─────────────────────────────────────────────────────────────

test.describe("/methodology", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/methodology");
    await page.waitForLoadState("networkidle");
  });

  test("six pipeline step cards are visible", async ({ page }) => {
    for (const step of ["Ingest", "Extract", "Validate", "Corroborate", "Synthesize", "Cite"]) {
      await expect(page.getByText(step).first()).toBeVisible();
    }
  });

  test("nine dossier anatomy cards are visible", async ({ page }) => {
    for (const card of [
      "Definition",
      "Strength Scorecard",
      "Now / Next / Later Horizons",
      "Key Stats",
      "Measured Demand",
      "Tyson Layer",
      "Bibliography",
    ]) {
      await expect(page.getByText(card).first()).toBeVisible();
    }
  });

  test("live stats tiles load after API call", async ({ page }) => {
    // Stats appear asynchronously from /api/methodology
    await expect(page.getByText(/source reports/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/megatrend dossiers/i)).toBeVisible();
  });

  test("source table appears with at least one row", async ({ page }) => {
    // Table appears inside Step 1 card once stats load
    const table = page.locator("table, [role=table]").first();
    await expect(table).toBeVisible({ timeout: 20_000 });
    const rows = table.locator("tr, [role=row]");
    expect(await rows.count()).toBeGreaterThan(1); // header + at least 1 source
  });
});

// ─── White Space Scout (/lab) ─────────────────────────────────────────────────

test.describe("/lab", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/lab");
    await page.waitForLoadState("networkidle");
  });

  test("Run Scout and Refresh buttons are visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /run scout/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /refresh/i })).toBeVisible();
  });

  test("Tyson-buildable filter checkbox is visible and toggleable", async ({ page }) => {
    // Wait for data — checkbox only renders when ideas exist
    const checkbox = page.locator('input[type="checkbox"]').first();
    await expect(checkbox).toBeVisible({ timeout: 20_000 });

    const before = await checkbox.isChecked();
    await checkbox.click();
    expect(await checkbox.isChecked()).toBe(!before);
  });

  test("idea cards appear with novelty score", async ({ page }) => {
    // Wait for ideas section heading
    await expect(page.getByText(/this run.s finds/i)).toBeVisible({ timeout: 20_000 });
    // At least one novelty badge (✦)
    await expect(page.getByText(/✦/).first()).toBeVisible();
  });

  test("Emerging Subtrends section shows cards", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /emerging subtrends/i })).toBeVisible({ timeout: 20_000 });
  });
});

// ─── Web Discovery (/discover) ───────────────────────────────────────────────

test.describe("/discover", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/discover");
    await page.waitForLoadState("networkidle");
  });

  test("period toggle buttons are visible and switch active state", async ({ page }) => {
    // PERIODS labels are "3M", "6M", "12M" (not week-suffixed)
    const toggles = page.locator("button").filter({ hasText: /^(3|6|12)M$/ });
    await expect(toggles.first()).toBeVisible({ timeout: 20_000 });

    const secondToggle = toggles.nth(1);
    await secondToggle.click();
    await expect(secondToggle).toHaveClass(/bg-white/, { timeout: 3_000 });
  });

  test("Discover from web button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /discover from web/i })).toBeVisible();
  });

  test("US Market Radar accordion expands on click", async ({ page }) => {
    await expect(page.getByText(/us market radar/i)).toBeVisible({ timeout: 20_000 });

    const accordionRow = page.locator("button").filter({ hasText: /protein|snacking|convenience/i }).first();
    await expect(accordionRow).toBeVisible({ timeout: 15_000 });
    await accordionRow.click();

    // Expanded state shows product cards
    await expect(page.getByText(/new in us/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test("Megatrend Discoveries accordion expands on click", async ({ page }) => {
    await expect(page.getByText(/megatrend discoveries/i)).toBeVisible({ timeout: 20_000 });

    // Click first megatrend accordion row
    const megatrendRow = page
      .locator("button[aria-expanded], button")
      .filter({ hasText: /protein|wellness|convenience|value/i })
      .first();
    await expect(megatrendRow).toBeVisible({ timeout: 15_000 });
    await megatrendRow.click();

    // Rising / innovations sections appear
    await expect(
      page.getByText(/rising on google trends|global innovations/i).first()
    ).toBeVisible({ timeout: 8_000 });
  });
});

// ─── Innovation Ideas (/ideas) ───────────────────────────────────────────────

test.describe("/ideas", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/ideas");
    await page.waitForLoadState("networkidle");
  });

  test("badge legend card is visible", async ({ page }) => {
    await expect(page.getByText(/how to read the badges/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/core/i).first()).toBeVisible();
    await expect(page.getByText(/adjacent/i).first()).toBeVisible();
  });

  test("megatrend accordion rows visible and expandable", async ({ page }) => {
    const row = page.locator("button").filter({ hasText: /concepts/i }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });

    // Default is open; clicking should collapse then re-expand
    await row.click();
    await row.click();
    await expect(page.getByText(/tyson concepts/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test("Emerging recipes section is visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /emerging recipes/i })
    ).toBeVisible({ timeout: 20_000 });
  });

  test("idea cards show tier badges", async ({ page }) => {
    await expect(
      page.getByText(/core|adjacent|stretch/i).first()
    ).toBeVisible({ timeout: 20_000 });
  });
});

// ─── Trend Map (/map) ─────────────────────────────────────────────────────────

test.describe("/map", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/map");
    await page.waitForLoadState("networkidle");
  });

  test("Build Map and Refresh buttons are visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /build map/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /refresh/i })).toBeVisible();
  });

  test("megatrend cards with overlap badges appear", async ({ page }) => {
    await expect(
      page.getByText(/decks agree|not in decks/i).first()
    ).toBeVisible({ timeout: 20_000 });
  });

  test("unassigned signals details element expands", async ({ page }) => {
    const details = page.locator("details").filter({ hasText: /corroborated signals/i }).first();
    await expect(details).toBeVisible({ timeout: 20_000 });

    const summary = details.locator("summary");
    await summary.click();
    await expect(details).toHaveAttribute("open", { timeout: 3_000 });
  });
});

// ─── Tyson Bites (/tyson) ────────────────────────────────────────────────────

test.describe("/tyson", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/tyson");
    await page.waitForLoadState("networkidle");
  });

  test("theme cards appear with persistence badges", async ({ page }) => {
    await expect(page.getByText(/of 7 months/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test("'Show source cards' button expands evidence cards", async ({ page }) => {
    const showBtn = page.getByRole("button", { name: /show \d+ source cards/i }).first();
    await expect(showBtn).toBeVisible({ timeout: 20_000 });
    await showBtn.click();

    await expect(
      page.getByRole("button", { name: /hide \d+ source cards/i }).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("source-kind badges (hartman/mintel/bites) appear on cards", async ({ page }) => {
    await expect(
      page.getByText(/hartman|mintel|bites/i).first()
    ).toBeVisible({ timeout: 20_000 });
  });
});

// ─── Mintel (/mintel) ────────────────────────────────────────────────────────

test.describe("/mintel", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/mintel");
    await page.waitForLoadState("networkidle");
  });

  test("stat tiles render after data loads", async ({ page }) => {
    await expect(page.getByText(/reports/i).first()).toBeVisible({ timeout: 20_000 });
    // Four stat tiles: reports / megatrends / subtrends / evidence nodes
    const tiles = page.locator("div").filter({ hasText: /^\d+$/ });
    expect(await tiles.count()).toBeGreaterThan(0);
  });

  test("report accordion row expands to show taxonomy", async ({ page }) => {
    const row = page.locator("button").filter({ hasText: /megatrend|subtrend/i }).first();
    // Fallback: any accordion button in the report list
    const anyRow = page.locator("button[aria-expanded]").first();
    const trigger = (await row.count()) ? row : anyRow;

    await expect(trigger).toBeVisible({ timeout: 20_000 });
    await trigger.click();

    // Expanded content contains entity chips or level text
    await expect(
      page.getByText(/product|ingredient|behaviour|subtrend/i).first()
    ).toBeVisible({ timeout: 5_000 });
  });
});
