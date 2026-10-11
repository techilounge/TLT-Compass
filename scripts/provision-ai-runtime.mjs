import env from "@next/env";
import pg from "pg";
import process from "node:process";
import console from "node:console";
import { URL } from "node:url";
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
env.loadEnvConfig(process.cwd());
const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  connectionTimeoutMillis: 15000,
});
try {
  if (process.argv[2] !== "--apply")
    throw new Error("Explicit application required");
  const target = new URL(process.env.SUPABASE_DB_URL),
    project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(
      ".",
    )[0];
  if (target.hostname !== `db.${project}.supabase.co`)
    throw new Error("Direct staging project connection required");
  let source = await readFile(".env.local", "utf8");
  if (process.env.AI_RUNTIME_DB_URL)
    throw new Error(
      "Runtime already provisioned; explicit rotation workflow required",
    );
  await client.connect();
  const password = randomBytes(32).toString("hex");
  // Hex-only generated value is safe as a SQL string literal; never output it.
  await client.query(
    `alter role tlt_ai_runtime login password '${password}' connection limit 10`,
  );
  target.username = "tlt_ai_runtime";
  target.password = password;
  source += `\nAI_RUNTIME_DB_URL=${target.toString()}\n`;
  if (!process.env.AI_CREDENTIAL_ENCRYPTION_KEY)
    source += `AI_CREDENTIAL_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}\n`;
  await writeFile(".env.local", source, { mode: 0o600 });
  console.log(
    JSON.stringify({
      runtimeProvisioned: true,
      role: "tlt_ai_runtime",
      secretsPrinted: false,
      ownerAssigned: false,
    }),
  );
} catch {
  console.error(
    "AI runtime provisioning did not complete. No credentials printed.",
  );
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
