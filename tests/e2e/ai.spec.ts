import { expect, test } from "@playwright/test";
const club = "10000000-0000-4000-8000-000000000001";
for (const path of ["ai", "ai/providers"])
  test(`AI session boundary: ${path}`, async ({ page }) => {
    await page.goto(`/workspace/${club}/${path}`);
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByRole("heading", { name: "AI providers & models" }),
    ).toHaveCount(0);
  });
test("assistant rejects cross-origin requests before processing", async ({
  request,
}) => {
  const result = await request.post(`/workspace/${club}/ai/chat`, {
    headers: { Origin: "https://untrusted.example" },
    data: { question: "synthetic" },
  });
  expect(result.status()).toBe(403);
  expect(await result.json()).toEqual({ error: "Assistant unavailable" });
});
