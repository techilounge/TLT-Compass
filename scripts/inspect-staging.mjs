import env from "@next/env";
import pg from "pg";
import process from "node:process";
import console from "node:console";

env.loadEnvConfig(process.cwd());
const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  connectionTimeoutMillis: 15000,
});
try {
  if (!process.env.SUPABASE_DB_URL)
    throw new Error("Missing database configuration");
  await client.connect();
  const tables = await client.query(
    "select tablename, rowsecurity from pg_tables where schemaname='public' order by tablename",
  );
  const users = await client.query(
    "select count(*)::int as count from auth.users",
  );
  console.log(
    JSON.stringify({
      publicTables: tables.rows,
      authUserCount: users.rows[0].count,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      error: "Staging inspection failed",
      code: error.code ?? error.name,
    }),
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
