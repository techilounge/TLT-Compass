import { expect, test } from "@playwright/test";

test("administration requires a signed-in club session", async ({ page }) => {
  await page.goto("/workspace/10000000-0000-4000-8000-000000000001/admin");
  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByRole("heading", { name: "Admin Dashboard" }),
  ).toHaveCount(0);
});

test("invalid administration club identifier is rejected", async ({ page }) => {
  await page.goto("/workspace/not-a-club/admin");
  await expect(
    page.getByRole("heading", { name: "This page could not be found." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Admin Dashboard" }),
  ).toHaveCount(0);
});
