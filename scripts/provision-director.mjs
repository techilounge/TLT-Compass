import env from "@next/env";
import pg from "pg";
import process from "node:process";
import console from "node:console";
import { URL } from "node:url";

env.loadEnvConfig(process.cwd());
const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  connectionTimeoutMillis: 15000,
});
let stage = "configuration";
try {
  if (
    process.argv[2] !== "--apply" ||
    process.env.TLT_DIRECTOR_ELIGIBILITY_CONFIRMED !== "true"
  ) {
    throw new Error(
      "Explicit application and human eligibility confirmation required",
    );
  }
  const email = process.env.TLT_INITIAL_DIRECTOR_EMAIL;
  const clubName = process.env.TLT_INITIAL_CLUB_NAME;
  if (!email || !clubName)
    throw new Error("Director and club configuration required");
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
  await client.query("set local statement_timeout='30s'");
  stage = "resolve account and club";
  const clubs = await client.query(
    "select id from public.clubs where name=$1 for update",
    [clubName],
  );
  const users = await client.query(
    "select id from auth.users where lower(email)=lower($1) and deleted_at is null",
    [email],
  );
  if (clubs.rows.length !== 1 || users.rows.length !== 1) {
    await client.query("rollback");
    console.log(
      JSON.stringify({
        provisioned: false,
        reason: "Exactly one existing club and invited auth account required",
        matchingClubs: clubs.rows.length,
        matchingAccounts: users.rows.length,
      }),
    );
    process.exitCode = 1;
  } else {
    const club = clubs.rows[0].id;
    const user = users.rows[0].id;
    stage = "provision membership";
    await client.query(
      "insert into public.profiles(id) values($1) on conflict(id) do nothing",
      [user],
    );
    await client.query(
      "insert into public.staff_eligibility(club_id,profile_id,eligible,reviewed_at) values($1,$2,true,now()) on conflict(club_id,profile_id) do update set eligible=true,reviewed_at=now() where not staff_eligibility.eligible",
      [club, user],
    );
    await client.query(
      "insert into public.club_memberships(club_id,profile_id,role) values($1,$2,'director') on conflict(club_id,profile_id,role) do update set status='active' where club_memberships.status<>'active'",
      [club, user],
    );
    stage = "verify MFA authorization boundary";
    await client.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: user, role: "authenticated", aal: "aal1" }),
    ]);
    await client.query("set local role authenticated");
    const lowAssurance = await client.query(
      "select * from public.effective_club_roles($1)",
      [club],
    );
    if (lowAssurance.rows.length !== 0)
      throw new Error("Adult access granted without MFA");
    await client.query("reset role");
    await client.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: user, role: "authenticated", aal: "aal2" }),
    ]);
    await client.query("set local role authenticated");
    const highAssurance = await client.query(
      "select public.has_club_role($1,array['director']::public.club_role[]) as allowed",
      [club],
    );
    if (!highAssurance.rows[0].allowed)
      throw new Error("Eligible director cannot access club with MFA claims");
    await client.query("reset role");
    await client.query("select set_config('request.jwt.claims','{}',true)");
    const invitation = await client.query(
      "select invited_at is not null as invited from auth.users where id=$1",
      [user],
    );
    await client.query("commit");
    console.log(
      JSON.stringify({
        provisioned: true,
        role: "director",
        mfaRequired: true,
        invitationRecorded: invitation.rows[0].invited,
        databaseMfaBoundaryVerified: true,
      }),
    );
  }
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error(
    JSON.stringify({
      error: "Director provisioning failed",
      stage,
      code: error.code ?? error.name,
    }),
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
