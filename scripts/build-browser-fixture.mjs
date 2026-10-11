import { spawnSync } from "node:child_process";
import process from "node:process";

// Never bake a developer's staging project into the browser test bundle.
const result = spawnSync(
  process.execPath,
  ["node_modules/next/dist/bin/next", "build"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        "sb_publishable_synthetic_browser_fixture",
      SUPABASE_DB_URL: "",
      AI_RUNTIME_DB_URL: "",
      AI_CREDENTIAL_ENCRYPTION_KEY: "",
    },
  },
);
process.exit(result.status ?? 1);
