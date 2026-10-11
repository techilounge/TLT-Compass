import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
export interface TestDatabase {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
  close(): Promise<void>;
}
export const ids = {
  north: "10000000-0000-4000-8000-000000000001",
  cedar: "10000000-0000-4000-8000-000000000002",
  director: "20000000-0000-4000-8000-000000000001",
  otherDirector: "20000000-0000-4000-8000-000000000002",
  mentor: "20000000-0000-4000-8000-000000000003",
  teen: "20000000-0000-4000-8000-000000000004",
  outsider: "20000000-0000-4000-8000-000000000005",
};
export async function createTestDatabase(): Promise<TestDatabase> {
  let db: TestDatabase;
  const nativeUrl = process.env.TEST_DATABASE_URL;
  if (nativeUrl) {
    const target = new URL(nativeUrl);
    if (
      !["localhost", "127.0.0.1"].includes(target.hostname) ||
      !target.pathname.endsWith("_test")
    )
      throw new Error("Native database tests require a local *_test database.");
    const admin = new Client({ connectionString: nativeUrl });
    await admin.connect();
    const name = `tlt_test_${randomUUID().replaceAll("-", "")}`;
    await admin.query(`create database ${name}`);
    target.pathname = `/${name}`;
    const client = new Client({ connectionString: target.toString() });
    await client.connect();
    db = {
      exec: (sql) => client.query(sql),
      query: async <T>(sql: string, params?: unknown[]) => ({
        rows: (await client.query(sql, params)).rows as T[],
      }),
      close: async () => {
        await client.end();
        await admin.query(`drop database ${name} with (force)`);
        await admin.end();
      },
    };
  } else {
    db = new PGlite() as TestDatabase;
  }
  // Auth identity contract only is stubbed. Application policies, SQL, grants,
  // triggers, functions and transactions execute in real PostgreSQL.
  await db.exec(`
    do $$ begin
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
      if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
    end $$;
    create schema auth; create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
  `);
  for (const file of (await readdir("supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  }
  await db.exec(await readFile("supabase/seed.sql", "utf8"));
  // Explicit synthetic test configuration; real migrations default global AI off.
  await db.exec(
    "update public.ai_global_settings set enabled=true,monthly_budget_usd=100000,attempts_per_minute=10000,actor_attempts_per_minute=100",
  );
  return db;
}
export async function asUser(db: TestDatabase, user: string, aal = "aal2") {
  await db.exec("reset role");
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
    [user, JSON.stringify({ sub: user, aal })],
  );
  await db.exec("set role authenticated");
}
