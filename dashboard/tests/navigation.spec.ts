/**
 * Navigation tests — sidebar "More" toggle, nav links, home page CTAs.
 */
import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
});

test("sidebar — More button expands hidden nav groups", async ({ page }) => {
  const moreBtn = page.getByRole("button", { name: /more/i });
  await expect(moreBtn).toBeVisible();

  // Groups hidden before expand
  await expect(page.getByRole("link", { name: /white space/i })).not.toBeVisible();

  await moreBtn.click();
  await expect(page.getByRole("link", { name: /white space/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /web discovery/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /mintel/i })).toBeVisible();
});

test("sidebar — More toggle hides groups again on second click", async ({ page }) => {
  const moreBtn = page.getByRole("button", { name: /more/i });
  await moreBtn.click();
  await expect(page.getByRole("link", { name: /white space/i })).toBeVisible();

  await moreBtn.click();
  await expect(page.getByRole("link", { name: /white space/i })).not.toBeVisible();
});

test("sidebar — Megatrends link navigates to /best", async ({ page }) => {
  await page.getByRole("link", { name: /megatrends/i }).first().click();
  await expect(page).toHaveURL("/best");
});

test("sidebar — Methodology link navigates to /methodology", async ({ page }) => {
  await page.getByRole("link", { name: /methodology/i }).first().click();
  await expect(page).toHaveURL("/methodology");
});

test("sidebar — More expanded: White Space link navigates to /lab", async ({ page }) => {
  await page.getByRole("button", { name: /more/i }).click();
  await page.getByRole("link", { name: /white space/i }).click();
  await expect(page).toHaveURL("/lab");
});

test("home — 'Explore Megatrends' CTA navigates to /best", async ({ page }) => {
  await page.getByRole("link", { name: /explore megatrends/i }).first().click();
  await expect(page).toHaveURL("/best");
});

test("home — 'How TrendLens works' link navigates to /methodology", async ({ page }) => {
  await page.getByRole("link", { name: /how trendlens works/i }).click();
  await expect(page).toHaveURL("/methodology");
});

test("home — 'White Space Scout' CTA navigates to /lab", async ({ page }) => {
  await page.getByRole("link", { name: /white space scout/i }).first().click();
  await expect(page).toHaveURL("/lab");
});
