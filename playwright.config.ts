import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  webServer: [
    {
      command: "npm run start -- --hostname 127.0.0.1 --port 3100",
      url: "http://127.0.0.1:3100",
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
          "sb_publishable_synthetic_browser_fixture",
        AI_RUNTIME_DB_URL: "",
        AI_CREDENTIAL_ENCRYPTION_KEY: "",
      },
    },
    {
      command: "npm run start -- --hostname 127.0.0.1 --port 3101",
      url: "http://127.0.0.1:3101",
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
        AI_RUNTIME_DB_URL: "",
        AI_CREDENTIAL_ENCRYPTION_KEY: "",
      },
    },
  ],
  projects: [
    {
      name: "chromium",
      testIgnore: "**/unconfigured.spec.ts",
      use: { browserName: "chromium" },
    },
    {
      name: "unconfigured",
      testMatch: "**/unconfigured.spec.ts",
      use: { browserName: "chromium", baseURL: "http://127.0.0.1:3101" },
    },
  ],
});
