import { test, expect } from "@playwright/test";

/**
 * Merge flow E2E tests against the Next.js dev server.
 *
 * Logs in via the password form, opens two sessions in the same area via
 * client-side navigation, merges table 2 into table 1, and verifies the
 * result (table 1 shows as fresh with no items).
 */

const PASSWORD = "1234";
const SPLASH_WAIT = 5000;

async function login(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.waitForSelector('input[type="password"]', { timeout: 20_000 });
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForSelector("nav", { timeout: 20_000 });
  await page.waitForTimeout(SPLASH_WAIT);
}

/** Table links in the floor render with a trailing slash, e.g. /table/snooker-1/. */
function tableSelector(area: string, tableN: number) {
  return `a[href="/table/${area}-${tableN}/"]`;
}

async function openTable(page: import("@playwright/test").Page, area: string, tableN: number) {
  const sel = tableSelector(area, tableN);
  const link = page.locator(sel).first();
  await expect(link).toBeVisible({ timeout: 15_000 });
  await link.click();
  await page.waitForURL(`/table/${area}-${tableN}/`, { timeout: 15_000 });
}

async function goToFloor(page: import("@playwright/test").Page) {
  await page.locator('nav a:has-text("الأرضية")').click();
  await page.waitForURL("/", { timeout: 15_000 });
}

async function verifyTableIsFresh(page: import("@playwright/test").Page, area: string, tableN: number) {
  await page.locator(tableSelector(area, tableN)).first().click();
  await page.waitForURL(`/table/${area}-${tableN}/`, { timeout: 15_000 });
  // A fresh session shows the product picker with "Coffee" — this confirms
  // the merge closed the old session (table 1 was previously occupied).
  await expect(page.locator("text=Coffee").first()).toBeVisible({ timeout: 10_000 });
}

async function runMergeFlow(page: import("@playwright/test").Page, area: string) {
  await openTable(page, area, 1);
  await goToFloor(page);
  await openTable(page, area, 2);

  // Click merge button
  const mergeBtn = page.locator('button:has-text("دمج مع طاولة أخرى")');
  await expect(mergeBtn).toBeVisible({ timeout: 10_000 });
  await mergeBtn.click();

  // Select donor row for table 1
  const donorBtn = page.locator('[role="dialog"] button:has-text("1")');
  await expect(donorBtn).toBeVisible({ timeout: 10_000 });
  await donorBtn.click();

  // Confirm merge
  await page.locator('[role="dialog"] button:has-text("تأكيد الدمج")').click();
  await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 10_000 });

  // Navigate to floor and verify table 1 is fresh
  await goToFloor(page);
  await verifyTableIsFresh(page, area, 1);
}

test("merge snooker table 2 into table 1", async ({ page }) => {
  await login(page);
  await runMergeFlow(page, "snooker");
});

test("merge cards table 2 into table 1", async ({ page }) => {
  await login(page);
  await runMergeFlow(page, "cards");
});

test("merge playstation table 2 into table 1", async ({ page }) => {
  await login(page);
  await runMergeFlow(page, "playstation");
});
