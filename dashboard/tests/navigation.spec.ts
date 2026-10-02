/**
 * Navigation tests — TopNav bar (horizontal, fixed, shown on all non-home pages).
 * TopNav items: Home | Megatrends | Web Discovery | Trend Map | Innovation Ideas | Sources ▾
 * Sources dropdown: Reports, Mintel, Tyson Bites
 * Home page (/) has NO TopNav.
 */
import { test, expect } from "@playwright/test";

// TopNav only shows on non-home pages — use /best as a stable base
test.beforeEach(async ({ page }) => {
  await page.goto("/best");
  await page.waitForLoadState("networkidle");
});

test("TopNav — renders on non-home pages", async ({ page }) => {
  const nav = page.locator("nav").first();
  await expect(nav).toBeVisible();
});

test("TopNav — does NOT render on home page", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  // Home page has no nav element from TopNav (it's conditionally suppressed)
  const topNav = page.locator("nav.fixed");
  await expect(topNav).not.toBeVisible();
});

test("TopNav — Megatrends link is present and active on /best", async ({ page }) => {
  const link = page.getByRole("link", { name: "Megatrends" });
  await expect(link).toBeVisible();
  // Active link gets bg-slate-900
  await expect(link).toHaveClass(/bg-slate-900/);
});

test("TopNav — Web Discovery link navigates to /discover", async ({ page }) => {
  await page.getByRole("link", { name: "Web Discovery" }).click();
  await expect(page).toHaveURL("/discover");
});

test("TopNav — Trend Map link navigates to /map", async ({ page }) => {
  await page.getByRole("link", { name: "Trend Map" }).click();
  await expect(page).toHaveURL("/map");
});

test("TopNav — Innovation Ideas link navigates to /ideas", async ({ page }) => {
  await page.getByRole("link", { name: "Innovation Ideas" }).click();
  await expect(page).toHaveURL("/ideas");
});

test("TopNav — Home link navigates to /", async ({ page }) => {
  await page.getByRole("link", { name: "Home" }).click();
  await expect(page).toHaveURL("/");
});

test("TopNav — Sources dropdown opens on click", async ({ page }) => {
  const sourcesBtn = page.locator("nav").getByRole("button", { name: /sources/i });
  await expect(sourcesBtn).toBeVisible();
  await sourcesBtn.click();

  // Dropdown shows the three source links
  await expect(page.getByRole("link", { name: "Reports" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Mintel" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Tyson Bites" })).toBeVisible();
});

test("TopNav — Sources dropdown closes on outside click", async ({ page }) => {
  await page.locator("nav").getByRole("button", { name: /sources/i }).click();
  await expect(page.getByRole("link", { name: "Mintel" })).toBeVisible();

  // Click outside the dropdown
  await page.locator("body").click({ position: { x: 640, y: 300 } });
  await expect(page.getByRole("link", { name: "Mintel" })).not.toBeVisible();
});

test("TopNav — Sources dropdown: Mintel link navigates to /mintel", async ({ page }) => {
  await page.locator("nav").getByRole("button", { name: /sources/i }).click();
  await page.getByRole("link", { name: "Mintel" }).click();
  await expect(page).toHaveURL("/mintel");
});

test("home — 'Explore Megatrends' CTA navigates to /megatrends", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: /explore megatrends/i }).first().click();
  await expect(page).toHaveURL("/megatrends");
});

test("home — 'White Space Scout' CTA navigates to /lab", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: /white space scout/i }).first().click();
  await expect(page).toHaveURL("/lab");
});
