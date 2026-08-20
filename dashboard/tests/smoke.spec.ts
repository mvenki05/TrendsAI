/**
 * Smoke tests — every route loads without a JS crash and shows its heading.
 * These run against a live dev server at localhost:3000.
 */
import { test, expect } from "@playwright/test";

const PAGES = [
  { route: "/",            heading: "TrendLens",                   role: "heading" as const },
  { route: "/best",        heading: "Megatrend Codex",             role: "heading" as const },
  { route: "/lab",         heading: "White Space Scout",           role: "heading" as const },
  { route: "/discover",    heading: "Web Discovery",               role: "heading" as const },
  { route: "/ideas",       heading: "Innovation Ideas",            role: "heading" as const },
  { route: "/map",         heading: "Our Trend Map",               role: "heading" as const },
  { route: "/methodology", heading: "TrendLens Methodology",       role: "heading" as const },
  { route: "/tyson",       heading: "Tyson Bites",                 role: "heading" as const },
  { route: "/mintel",      heading: "Mintel Intelligence",         role: "heading" as const },
  { route: "/reports",     heading: "Reports",                     role: "heading" as const },
];

for (const { route, heading, role } of PAGES) {
  test(`${route} — loads without crash and shows heading`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto(route);
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByRole(role, { name: new RegExp(heading, "i") }).first()).toBeVisible();
    expect(errors.filter((e) => !e.includes("ResizeObserver"))).toHaveLength(0);
  });
}
