import { expect, test } from "@playwright/test";
const club = "10000000-0000-4000-8000-000000000001";
const record = "60000000-0000-4000-8000-000000000001";
for (const path of [
  "calendar",
  "calendar/import",
  `calendar/import/${record}`,
  `calendar/drafts/${record}`,
  `calendar/pdf/${record}`,
  `calendar/${record}`,
  "calendar/export",
  `calendar/roster/${record}`,
]) {
  test(`calendar session boundary: ${path}`, async ({ page }) => {
    await page.goto(`/workspace/${club}/${path}`);
    await expect(page).toHaveURL(/\/login/);
  });
}
