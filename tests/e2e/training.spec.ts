import { expect, test } from "@playwright/test";
for (const path of [
  "attendance",
  "hours",
  "recognition",
  "dashboard",
  "record-book/60000000-0000-4000-8000-000000000001",
  "exports/60000000-0000-4000-8000-000000000001?format=pdf",
  "exports/60000000-0000-4000-8000-000000000001",
]) {
  test(`${path} requires a signed-in session`, async ({ page }) => {
    await page.goto(`/workspace/10000000-0000-4000-8000-000000000001/${path}`);
    await expect(page).toHaveURL(/\/login/);
  });
}
