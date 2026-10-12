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
  if (process.argv[2] !== "--apply") throw new Error("Explicit apply required");
  const project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(
    ".",
  )[0];
  const database = new URL(process.env.SUPABASE_DB_URL);
  if (
    database.hostname !== `db.${project}.supabase.co` &&
    !(
      database.hostname.endsWith(".pooler.supabase.com") &&
      database.username === `postgres.${project}`
    )
  ) {
    throw new Error("Database project mismatch");
  }
  stage = "connection";
  await client.connect();
  await client.query("begin");
  await client.query("set local lock_timeout='10s'");
  await client.query("set local statement_timeout='60s'");
  await client.query("select pg_advisory_xact_lock(724691183)");
  const existing = await client.query(
    "select count(*)::int as count from pg_tables where schemaname='public'",
  );
  const history = await client.query(
    "select to_regclass('supabase_migrations.schema_migrations') as history",
  );
  if (existing.rows[0].count || history.rows[0].history)
    throw new Error("Initial migration requires empty schema and history");
  await client.query("create schema if not exists supabase_migrations");
  await client.query(
    "create table supabase_migrations.schema_migrations(version text primary key, statements text[], name text)",
  );
  const files = (await readdir("supabase/migrations"))
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort();
  for (const file of files) {
    stage = file;
    const sql = await readFile(`supabase/migrations/${file}`, "utf8");
    await client.query(sql);
    const [, version, name] = file.match(/^(\d+)_(.+)\.sql$/);
    await client.query(
      "insert into supabase_migrations.schema_migrations(version,statements,name) values($1,$2,$3)",
      [version, [sql], name],
    );
  }
  stage = "club setup";
  const clubName = process.env.TLT_INITIAL_CLUB_NAME;
  const timezone = process.env.TLT_INITIAL_CLUB_TIMEZONE;
  if (!clubName || !timezone)
    throw new Error("Initial club configuration required");
  await client.query("insert into public.clubs(name,timezone) values($1,$2)", [
    clubName,
    timezone,
  ]);
  stage = "RLS verification";
  const tables = await client.query(
    "select tablename,rowsecurity from pg_tables where schemaname='public' order by tablename",
  );
  if (tables.rows.some((t) => !t.rowsecurity))
    throw new Error("Table without RLS");
  await client.query("set local role authenticated");
  for (const table of tables.rows) {
    const result = await client.query(
      `select count(*)::int as count from public."${table.tablename.replaceAll('"', '""')}"`,
    );
    if (result.rows[0].count !== 0)
      throw new Error("Unscoped session can read records");
  }
  await client.query("reset role");
  await client.query("savepoint anon_check");
  await client.query("set local role anon");
  let denied = false;
  try {
    await client.query("select * from public.clubs");
  } catch (error) {
    if (error.code !== "42501") throw error;
    denied = true;
  }
  await client.query("rollback to savepoint anon_check");
  if (!denied) throw new Error("Anonymous table access unexpectedly granted");
  await client.query("notify pgrst, 'reload schema'");
  stage = "commit";
  await client.query("commit");
  console.log(
    JSON.stringify({
      applied: files,
      rlsTables: tables.rows.length,
      unscopedReadBlocked: true,
      anonymousReadBlocked: true,
      clubCreated: true,
      demoSeedApplied: false,
    }),
  );
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error(
    JSON.stringify({
      error:
        "Initial staging migration failed; transaction rolled back if active",
      stage,
      code: error.code ?? error.name,
    }),
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
