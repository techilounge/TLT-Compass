import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
for (const colorScheme of ["light", "dark"] as const) {
  for (const width of [320, 375, 768, 1440]) {
    test(`foundation ${colorScheme} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.goto("/");
      await expect(page.locator("body")).toHaveCSS(
        "font-family",
        "Arial, Helvetica, sans-serif",
      );
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        "A clear direction.",
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
      await page.keyboard.press("Tab");
      await expect(
        page.getByRole("link", { name: "Skip to content" }),
      ).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("main")).toBeFocused();
      await page.getByRole("link", { name: "Explore the journey" }).click();
      await expect(page).toHaveURL(/#journey$/);
      await page.screenshot({
        path: `test-results/foundation-${colorScheme}-${width}.png`,
        fullPage: true,
      });
    });
  }
}
