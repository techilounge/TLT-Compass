import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("unconfigured authentication fails closed", async ({ page }) => {
  await page.goto("/workspace");
  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeDisabled();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.goto("/workspace/10000000-0000-4000-8000-000000000001");
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/auth/confirm?token_hash=invalid&type=invite");
  await expect(page).toHaveURL(/\/login/);
});
