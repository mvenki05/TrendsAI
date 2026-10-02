/**
 * Smoke tests — every route loads without a JS crash and shows its heading.
 * These run against a live dev server at localhost:3000.
 */
import { test, expect } from "@playwright/test";

// /best has no static heading — the dossier name is dynamic from BigQuery.
// All other pages have a stable h1.
const PAGES = [
  { route: "/",            heading: "TrendLens" },
  { route: "/lab",         heading: "White Space Scout" },
  { route: "/discover",    heading: "Web Discovery" },
  { route: "/ideas",       heading: "Innovation Ideas" },
  { route: "/map",         heading: "Our Trend Map" },
  { route: "/methodology", heading: "TrendLens Methodology" },
  { route: "/tyson",       heading: "Tyson Bites" },
  { route: "/mintel",      heading: "Mintel Intelligence" },
  { route: "/reports",     heading: "Reports" },
];

for (const { route, heading } of PAGES) {
  test(`${route} — loads without crash and shows heading`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto(route);
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: new RegExp(heading, "i") }).first()).toBeVisible();
    expect(errors.filter((e) => !e.includes("ResizeObserver"))).toHaveLength(0);
  });
}

test("/best — loads without crash and megatrend panel appears", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/best");
  // /best loads megatrend cards from BigQuery — wait for the panel to populate
  await expect(page.locator("aside button").first()).toBeVisible({ timeout: 45_000 });
  expect(errors.filter((e) => !e.includes("ResizeObserver"))).toHaveLength(0);
});
