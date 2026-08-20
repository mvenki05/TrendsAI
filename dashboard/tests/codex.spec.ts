/**
 * Megatrend Codex (/best) interaction tests.
 * Assumes at least one megatrend dossier exists in BigQuery.
 */
import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/best");
  // Wait for BigQuery data — spinner disappears and aside cards appear
  await expect(page.locator("aside").getByRole("button").first()).toBeVisible({ timeout: 30_000 });
});

test("codex — megatrend selector cards render in aside panel", async ({ page }) => {
  const cards = page.locator("aside").getByRole("button");
  await expect(cards.first()).toBeVisible();
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);
});

test("codex — first megatrend auto-selects and shows dossier heading", async ({ page }) => {
  const h2 = page.locator("main h2, article h2").first();
  await expect(h2).toBeVisible({ timeout: 20_000 });
  const text = await h2.textContent();
  expect(text?.trim().length).toBeGreaterThan(0);
});

test("codex — clicking a different megatrend updates the dossier", async ({ page }) => {
  // Get current dossier name
  const h2 = page.locator("main h2, article h2").first();
  await expect(h2).toBeVisible({ timeout: 20_000 });
  const firstName = await h2.textContent();

  // Click the second megatrend card if there is one
  const cards = page.locator("aside").getByRole("button");
  const count = await cards.count();
  if (count < 2) {
    test.skip();
    return;
  }
  await cards.nth(1).click();

  // Dossier heading should update (wait for it to differ or just be visible)
  await expect(h2).toBeVisible({ timeout: 15_000 });
  const secondName = await h2.textContent();
  expect(secondName).not.toEqual(firstName);
});

test("codex — section scroll links appear below active megatrend card", async ({ page }) => {
  await expect(page.getByRole("button", { name: /what.s happening now/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /horizons/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /subtrends/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /tyson layer/i })).toBeVisible();
});

test("codex — subtrend carousel cards are visible", async ({ page }) => {
  const firstCard = page.locator('[id^="subtrend-card-"]').first();
  await expect(firstCard).toBeVisible({ timeout: 20_000 });
});

test("codex — clicking second subtrend card updates detail panel", async ({ page }) => {
  const secondCard = page.locator('[id="subtrend-card-1"]');
  await expect(secondCard).toBeVisible({ timeout: 20_000 });

  // Note the first card's subtrend name
  const firstName = await page.locator('[id="subtrend-card-0"] h5').textContent();

  await secondCard.click();

  // Active card gets ring-2; detail panel should reflect second subtrend
  await expect(secondCard).toHaveClass(/ring-2/, { timeout: 5_000 });
  const secondName = await page.locator('[id="subtrend-card-1"] h5').textContent();
  expect(secondName).not.toEqual(firstName);
});

test("codex — carousel '›' button scrolls carousel right", async ({ page }) => {
  const nextBtn = page.getByRole("button", { name: "›" });
  await expect(nextBtn).toBeVisible({ timeout: 20_000 });

  const carousel = page.locator('[id^="subtrend-card-"]').first().locator("..");
  const scrollBefore = await carousel.evaluate((el) => el.scrollLeft);

  await nextBtn.click();
  await page.waitForTimeout(400); // scroll animation

  const scrollAfter = await carousel.evaluate((el) => el.scrollLeft);
  expect(scrollAfter).toBeGreaterThan(scrollBefore);
});

test("codex — '▶ Present' button opens present-mode overlay", async ({ page }) => {
  const presentBtn = page.getByRole("button", { name: /present/i });
  await expect(presentBtn).toBeVisible({ timeout: 20_000 });
  await presentBtn.click();

  // PresentMode mounts a full-screen overlay — look for its close/exit button
  await expect(
    page.getByRole("button", { name: /exit|close|esc/i }).or(page.locator("[data-present-mode]"))
  ).toBeVisible({ timeout: 5_000 });
});

test("codex — section scroll link scrolls to Subtrends section", async ({ page }) => {
  const subtrends = page.getByRole("button", { name: /^subtrends/i });
  await expect(subtrends).toBeVisible({ timeout: 15_000 });
  await subtrends.click();

  // #sec-subtrends heading should now be near viewport
  const secHeading = page.locator("#sec-subtrends");
  await expect(secHeading).toBeInViewport({ timeout: 5_000 });
});

test("codex — horizon columns Now / Next / Later are all visible", async ({ page }) => {
  await expect(page.getByText("0–12 mo · act")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("1–3 yr · develop")).toBeVisible();
  await expect(page.getByText("3+ yr · position")).toBeVisible();
});

test("codex — Tyson layer section headings visible", async ({ page }) => {
  await expect(page.getByText(/how might tyson/i).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/already in tyson/i).first()).toBeVisible();
  await expect(page.getByText(/white space/i).first()).toBeVisible();
});
