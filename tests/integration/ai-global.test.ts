import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { asUser, createTestDatabase, ids, type TestDatabase } from "./database";
describe("global AI ceilings across tenants", () => {
  let db: TestDatabase, northModel: string, cedarModel: string;
  beforeAll(async () => {
    db = await createTestDatabase();
    await db.query(
      "insert into public.platform_owners(profile_id) values($1),($2)",
      [ids.director, ids.otherDirector],
    );
    await db.query(
      "insert into public.club_memberships(club_id,profile_id,role) values($1,$2,'director')",
      [ids.cedar, ids.director],
    );
    await db.query(
      "insert into public.staff_eligibility(club_id,profile_id,eligible,reviewed_at) values($1,$2,true,now())",
      [ids.cedar, ids.director],
    );
    for (const [club, actor] of [
      [ids.north, ids.director],
      [ids.cedar, ids.otherDirector],
    ]) {
      await db.query(
        "insert into public.ai_settings(club_id,enabled,monthly_budget_usd,role_monthly_budget_usd,request_ceiling_usd) values($1,true,1,1,1)",
        [club],
      );
      const provider = (
        await db.query<{ id: string }>(
          "insert into public.ai_providers(club_id,name,provider_type,base_url,credential_secret_ref,priority,enabled,privacy_approved,created_by) values($1,'Synthetic','gemini','https://generativelanguage.googleapis.com/v1beta','AI_SECRET_TEST',1,true,true,$2) returning id",
          [club, actor],
        )
      ).rows[0].id;
      const model = (
        await db.query<{ id: string }>(
          "insert into public.ai_models(club_id,provider_id,model_id,purposes,priority,context_limit,max_output_tokens,price_in_per_million,price_out_per_million,enabled) values($1,$2,'synthetic',array['assistant_chat'],1,4096,128,1,2,true) returning id",
          [club, provider],
        )
      ).rows[0].id;
      if (club === ids.north) northModel = model;
      else cedarModel = model;
    }
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });
  const reserve = (club: string, model: string) =>
    db.query(
      "select public.reserve_ai_attempt($1,$2,'assistant_chat',$3,1000,64)",
      [club, model, randomUUID()],
    );
  it("requires owner MFA, defaults safely when disabled and prevents bypass of the tenant function", async () => {
    await asUser(db, ids.mentor);
    await expect(
      db.query("select public.configure_global_ai(true,1,10,10)"),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.director, "aal1");
    await expect(
      db.query("select public.configure_global_ai(true,1,10,10)"),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.director);
    await db.query("select public.configure_global_ai(false,1,10,10)");
    await expect(reserve(ids.north, northModel)).rejects.toThrow(
      "Global AI disabled",
    );
    await expect(
      db.query(
        "select public.reserve_ai_attempt_tenant($1,$2,'assistant_chat',$3,1000,64)",
        [ids.north, northModel, randomUUID()],
      ),
    ).rejects.toThrow("permission denied");
  });
  it("rejects aggregate overspend and rolls back the failed reservation", async () => {
    await db.query("select public.configure_global_ai(true,0.0012,10,10)");
    await reserve(ids.north, northModel);
    await asUser(db, ids.otherDirector);
    await expect(reserve(ids.cedar, cedarModel)).rejects.toThrow(
      "Global AI budget reached",
    );
    expect(
      (await db.query("select id from public.ai_attempts")).rows,
    ).toHaveLength(0);
  });
  it("applies platform-wide and cross-club actor rate limits and keeps configuration history", async () => {
    await asUser(db, ids.director);
    await db.query("select public.configure_global_ai(true,1,1,10)");
    await asUser(db, ids.otherDirector);
    await expect(reserve(ids.cedar, cedarModel)).rejects.toThrow(
      "Global AI rate limit",
    );
    await asUser(db, ids.director);
    await db.query("select public.configure_global_ai(true,1,10,1)");
    await expect(reserve(ids.cedar, cedarModel)).rejects.toThrow(
      "Global AI rate limit",
    );
    expect(
      (await db.query("select id from public.ai_global_settings_history")).rows,
    ).toHaveLength(4);
    await expect(
      db.query("update public.ai_global_settings set enabled=true"),
    ).rejects.toThrow("permission denied");
  });
  it("reports the full month beyond the recent-attempt table while enforcing manager and owner scope", async () => {
    await db.exec("reset role");
    await db.query(
      "insert into public.ai_attempts(club_id,provider_id,model_id,actor_profile_id,actor_role,purpose,trace_id,reserved_usd) select club_id,provider_id,model_id,actor_profile_id,actor_role,purpose,gen_random_uuid(),0.001 from public.ai_attempts cross join generate_series(1,151) where model_id=$1 limit 151",
      [northModel],
    );
    await asUser(db, ids.director);
    const club = (
      await db.query<{
        usage: { attempts: number; scope: string; days: unknown[] };
      }>("select public.club_ai_usage($1) usage", [ids.north])
    ).rows[0].usage;
    expect(club.attempts).toBe(152);
    expect(club.scope).toBe("club");
    expect(club.days).toHaveLength(1);
    expect(
      (
        await db.query<{ usage: { attempts: number } }>(
          "select public.global_ai_usage() usage",
        )
      ).rows[0].usage.attempts,
    ).toBe(152);
    await asUser(db, ids.otherDirector);
    expect(
      (
        await db.query<{ usage: { attempts: number } }>(
          "select public.club_ai_usage($1) usage",
          [ids.cedar],
        )
      ).rows[0].usage.attempts,
    ).toBe(0);
    await expect(
      db.query("select public.club_ai_usage($1)", [ids.north]),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.mentor);
    expect(
      (
        await db.query<{ usage: { attempts: number; scope: string } }>(
          "select public.club_ai_usage($1) usage",
          [ids.north],
        )
      ).rows[0].usage,
    ).toMatchObject({ attempts: 0, scope: "own" });
    await expect(db.query("select public.global_ai_usage()")).rejects.toThrow(
      "Not authorized",
    );
    await expect(
      db.query("select public.ai_usage_payload(null,null)"),
    ).rejects.toThrow("permission denied");
  });
});
