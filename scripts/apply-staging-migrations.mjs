import env from "@next/env";
import pg from "pg";
import process from "node:process";
import console from "node:console";
import { URL } from "node:url";
import { readFile, readdir } from "node:fs/promises";

env.loadEnvConfig(process.cwd());
const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  connectionTimeoutMillis: 15000,
});
let stage = "configuration";
try {
  if (process.argv[2] !== "--apply")
    throw new Error("Explicit application required");
  const project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(
    ".",
  )[0];
  const target = new URL(process.env.SUPABASE_DB_URL);
  if (
    target.hostname !== `db.${project}.supabase.co` &&
    !(
      target.hostname.endsWith(".pooler.supabase.com") &&
      target.username === `postgres.${project}`
    )
  )
    throw new Error("Project mismatch");
  await client.connect();
  await client.query("begin");
  await client.query("set local lock_timeout='10s'");
  await client.query("set local statement_timeout='60s'");
  await client.query("select pg_advisory_xact_lock(724691183)");
  stage = "history verification";
  const history = await client.query(
    "select version,statements from supabase_migrations.schema_migrations order by version",
  );
  const files = (await readdir("supabase/migrations"))
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort();
  const local = await Promise.all(
    files.map(async (file) => ({
      file,
      version: file.split("_")[0],
      sql: await readFile(`supabase/migrations/${file}`, "utf8"),
    })),
  );
  for (const row of history.rows) {
    if (
      local
        .find((m) => m.version === row.version)
        ?.sql.replaceAll("\r\n", "\n") !==
      row.statements?.[0]?.replaceAll("\r\n", "\n")
    )
      throw new Error("Migration history differs; review required");
  }
  const applied = [];
  for (const migration of local.filter(
    (m) => !history.rows.some((h) => h.version === m.version),
  )) {
    if (history.rows.some((h) => h.version > migration.version))
      throw new Error("Out-of-order migration");
    stage = migration.file;
    await client.query(migration.sql);
    await client.query(
      "insert into supabase_migrations.schema_migrations(version,statements,name) values($1,$2,$3)",
      [
        migration.version,
        [migration.sql],
        migration.file.slice(migration.version.length + 1, -4),
      ],
    );
    applied.push(migration.file);
  }
  await client.query("notify pgrst,'reload schema'");
  await client.query("commit");
  console.log(JSON.stringify({ applied, demoSeedApplied: false }));
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error(
    JSON.stringify({
      error: "Staging migration failed; rolled back if active",
      stage,
      code: error.code ?? error.name,
    }),
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
