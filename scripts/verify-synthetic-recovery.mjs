import process from "node:process";
import console from "node:console";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { URL } from "node:url";
import { Client } from "pg";
import { createTestDatabase, ids } from "../tests/integration/database.ts";

// CI-only rehearsal: no hosted connection, real records or saved dump artifact.
const container = process.env.TEST_POSTGRES_CONTAINER;
const target = new URL(process.env.TEST_DATABASE_URL ?? "http://invalid");
if (
  !container ||
  !/^[a-f0-9]{12,64}$/.test(container) ||
  !["localhost", "127.0.0.1"].includes(target.hostname) ||
  !target.pathname.endsWith("_test")
) {
  throw new Error(
    "Recovery rehearsal requires the local synthetic CI database and container.",
  );
}
const admin = new Client({ connectionString: target.toString() });
const restoredName = `tlt_restore_${randomUUID().replaceAll("-", "")}`;
let original,
  restored,
  created = false;
try {
  await admin.connect();
  original = await createTestDatabase();
  const originalName = (await original.query("select current_database() name"))
    .rows[0].name;
  const dump = execFileSync(
    "docker",
    [
      "exec",
      container,
      "pg_dump",
      "-U",
      "postgres",
      "--format=custom",
      "--dbname",
      originalName,
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  await admin.query(`create database ${restoredName}`);
  created = true;
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "pg_restore",
      "-U",
      "postgres",
      "--exit-on-error",
      "--dbname",
      restoredName,
    ],
    { input: dump, maxBuffer: 1024 * 1024 },
  );
  target.pathname = `/${restoredName}`;
  restored = new Client({ connectionString: target.toString() });
  await restored.connect();
  const originals = (
    await original.query(
      "select count(*)::integer total from public.program_requirements",
    )
  ).rows[0].total;
  const copies = (
    await restored.query(
      "select count(*)::integer total from public.program_requirements",
    )
  ).rows[0].total;
  if (originals !== copies || originals !== 2)
    throw new Error("Restored fixture rows differ");
  const policies = (
    await restored.query(
      "select count(*)::integer total from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relrowsecurity",
    )
  ).rows[0].total;
  if (policies < 20) throw new Error("Restored RLS policies missing");
  await restored.query(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
    [ids.teen, JSON.stringify({ sub: ids.teen, aal: "aal1" })],
  );
  await restored.query("set role authenticated");
  const clubs = (await restored.query("select id from public.clubs")).rows;
  if (clubs.length !== 1 || clubs[0].id !== ids.north)
    throw new Error("Restored tenant isolation failed");
  let denied = false;
  try {
    await restored.query("select * from public.ai_credentials");
  } catch (error) {
    denied = error.code === "42501";
  }
  if (!denied) throw new Error("Restored credential boundary failed");
  console.log(
    JSON.stringify({
      synthetic_recovery: "passed",
      fixture_requirements: copies,
      rls_tables: policies,
      tenant_isolation: true,
      credential_read_denied: true,
      dump_saved: false,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      synthetic_recovery: "failed",
      code: error.code ?? "REHEARSAL_CHECK",
    }),
  );
  process.exitCode = 1;
} finally {
  await restored?.end().catch(() => {});
  if (created)
    await admin
      .query(`drop database ${restoredName} with (force)`)
      .catch(() => {
        process.exitCode = 1;
      });
  await original?.close().catch(() => {
    process.exitCode = 1;
  });
  await admin.end().catch(() => {});
}
