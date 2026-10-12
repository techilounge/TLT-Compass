import { expect, test } from "@playwright/test";

test("default invite establishes a cookie session before password navigation", async ({
  page,
  context,
}) => {
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    aud: "authenticated",
    role: "authenticated",
    email: "synthetic@example.invalid",
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const token = [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(
      JSON.stringify({
        sub: user.id,
        aud: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url"),
    "synthetic-signature",
  ].join(".");
  await page.route("**/auth/v1/user", (route) => route.fulfill({ json: user }));
  // This isolates the browser handoff; it does not bypass the real server auth guard.
  await page.route("**/account/password", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Password setup reached</h1>",
    }),
  );
  await page.goto(
    `/#type=invite&access_token=${token}&refresh_token=synthetic-refresh`,
  );
  await expect(page).toHaveURL(/\/account\/password$/);
  const cookies = await context.cookies();
  expect(cookies.some((cookie) => cookie.name.includes("auth-token"))).toBe(
    true,
  );
});

test("incomplete invitation removes credentials and rejects external redirect", async ({
  page,
}) => {
  await page.goto(
    "/#type=invite&access_token=synthetic-invalid&next=https://example.com",
  );
  await expect(page).toHaveURL(/\/login\?notice=email-link-incomplete$/);
  expect(new URL(page.url()).hash).toBe("");
});

test("expired email link removes error details and shows sign-in", async ({
  page,
}) => {
  await page.goto(
    "/#error_code=otp_expired&error_description=synthetic-detail",
  );
  await expect(page).toHaveURL(/\/login\?notice=email-link-expired$/);
  expect(new URL(page.url()).hash).toBe("");
});
