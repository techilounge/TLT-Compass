import { expect, test } from "@playwright/test";
const club = "10000000-0000-4000-8000-000000000001",
  record = "60000000-0000-4000-8000-000000000001";
for (const path of [
  "games",
  "games/import",
  `games/import/${record}`,
  `games/import/${record}/rows/0`,
  "notifications",
  "games/results",
  "games/teams",
  "curriculum/catalog",
  `curriculum/${record}`,
  "ai/proposals",
  `ai/proposals/${record}`,
  "ai/task-proposals",
  `ai/task-proposals/${record}`,
])
  test(`protected session boundary: ${path}`, async ({ page }) => {
    await page.goto(`/workspace/${club}/${path}`);
    await expect(page).toHaveURL(/\/login/);
  });
