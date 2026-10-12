import { expect, test } from "@playwright/test";
test("production CSP uses unique nonces and permits hydrated core workflows", async ({
  page,
  request,
}) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /Content Security Policy|violates.*directive/i.test(message.text())
    )
      violations.push(message.text());
  });
  const response = await page.goto("/sandbox"),
    policy = response?.headers()["content-security-policy"] ?? "";
  expect(policy).toContain("'strict-dynamic'");
  expect(policy).not.toContain("'unsafe-eval'");
  expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
  const nonce = policy.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce).toBeTruthy();
  expect(await page.locator("script[nonce]").count()).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Assign practice task" }).click();
  await expect(
    page.getByRole("button", { name: "Assign practice task" }),
  ).toHaveCount(0);
  const second = await request.get("/sandbox");
  expect(second.headers()["content-security-policy"]).not.toContain(
    `'nonce-${nonce}'`,
  );
  expect(violations).toEqual([]);
});
test("install manifest and generated icons are available without private data", async ({
  request,
}) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.status()).toBe(200);
  const manifest = await response.json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/workspace");
  for (const icon of manifest.icons) {
    const image = await request.get(icon.src);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toContain("image/png");
  }
});
