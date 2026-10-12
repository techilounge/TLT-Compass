import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("practice task moves through changes, resubmission and mentor sign-off", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 1000 });
  await page.goto("/sandbox");
  await expect(
    page.getByRole("heading", { name: "Synthetic sandbox" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Assign practice task" }).click();
  await page.getByRole("button", { name: "Participant view" }).click();
  await expect(
    page.getByRole("button", { name: "Verify practice requirement" }),
  ).toHaveCount(0);
  await page
    .getByLabel("What you did (evidence)")
    .fill("I drafted a service plan with two teams.");
  await page
    .getByLabel("What you learned (reflection)")
    .fill("I learned to explain each responsibility.");
  await page.getByRole("button", { name: "Submit for mentor review" }).click();
  await page.getByRole("button", { name: "Mentor view" }).click();
  await page
    .getByLabel("Mentor feedback")
    .fill("Please name the supervising adult.");
  await page.getByLabel("I reviewed the practice evidence.").check();
  await page.getByRole("button", { name: "Request changes" }).click();
  await page.getByRole("button", { name: "Participant view" }).click();
  await page
    .getByLabel("What you did (evidence)")
    .fill("Demo Mentor supervises; each team has clear roles.");
  await page
    .getByLabel("What you learned (reflection)")
    .fill("I clarified supervision and responsibilities.");
  await page.getByRole("button", { name: "Submit for mentor review" }).click();
  await page.getByRole("button", { name: "Mentor view" }).click();
  await page
    .getByLabel("Mentor feedback")
    .fill("Reviewed together. The practice plan meets the exercise.");
  await page.getByLabel("I reviewed the practice evidence.").check();
  await page
    .getByRole("button", { name: "Verify practice requirement" })
    .click();
  await expect(
    page.getByText("Reviewed by Demo Mentor · Evidence version 2"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Evidence version 1" }),
  ).toBeVisible();
  await expect(page.getByText("1 / 1", { exact: true })).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/record-book-verified-mobile.png",
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Assign practice task" }),
  ).toBeVisible();
});
for (const colorScheme of ["light", "dark"] as const)
  for (const width of [320, 375, 768, 1440])
    test(`sandbox ${colorScheme} ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.goto("/sandbox");
      await expect(page.locator("body")).toHaveCSS(
        "font-family",
        "Arial, Helvetica, sans-serif",
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      await page.screenshot({
        path: `test-results/sandbox-${colorScheme}-${width}.png`,
        fullPage: true,
      });
    });
