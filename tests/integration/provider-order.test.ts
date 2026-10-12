import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { asUser, createTestDatabase, ids, type TestDatabase } from "./database";
describe("provider order controls", () => {
  let db: TestDatabase;
  let providers: string[];
  beforeAll(async () => {
    db = await createTestDatabase();
    await db.exec(
      `insert into public.platform_owners(profile_id) values('${ids.director}')`,
    );
    await asUser(db, ids.director);
    providers = (
      await db.query<{ id: string }>(
        "insert into public.ai_providers(club_id,name,provider_type,base_url,credential_secret_ref,priority,created_by) select $1,'Provider '||i,'openrouter','https://openrouter.ai/api/v1','AI_SECRET_TEST',i*10,$2 from generate_series(1,3) i returning id",
        [ids.north, ids.director],
      )
    ).rows.map((r) => r.id);
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });
  it("moves adjacent providers and normalizes priorities without changing configuration", async () => {
    await db.query("select public.move_ai_provider($1,$2,-1)", [
      ids.north,
      providers[2],
    ]);
    const rows = (
      await db.query<{ id: string; priority: number; enabled: boolean }>(
        "select id,priority,enabled from public.ai_providers order by priority,id",
      )
    ).rows;
    expect(rows.map((r) => r.id)).toEqual([
      providers[0],
      providers[2],
      providers[1],
    ]);
    expect(rows.map((r) => r.priority)).toEqual([0, 1, 2]);
    expect(rows.every((r) => !r.enabled)).toBe(true);
    await db.query("select public.move_ai_provider($1,$2,-1)", [
      ids.north,
      providers[0],
    ]);
    expect(
      (
        await db.query<{ id: string }>(
          "select id from public.ai_providers order by priority,id",
        )
      ).rows.map((r) => r.id),
    ).toEqual([providers[0], providers[2], providers[1]]);
  });
  it("rejects foreign scopes, invalid directions and sessions without MFA", async () => {
    await expect(
      db.query("select public.move_ai_provider($1,$2,1)", [
        ids.cedar,
        providers[0],
      ]),
    ).rejects.toThrow("Not authorized");
    await expect(
      db.query("select public.move_ai_provider($1,$2,0)", [
        ids.north,
        providers[0],
      ]),
    ).rejects.toThrow("Invalid direction");
    await asUser(db, ids.director, "aal1");
    await expect(
      db.query("select public.move_ai_provider($1,$2,1)", [
        ids.north,
        providers[0],
      ]),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.otherDirector);
    await expect(
      db.query("select public.move_ai_provider($1,$2,1)", [
        ids.north,
        providers[0],
      ]),
    ).rejects.toThrow("Not authorized");
  });
  it("aggregates failures, incomplete tokens and latency while preserving reporting scope", async () => {
    await asUser(db, ids.director);
    const model = (
      await db.query<{ id: string }>(
        "insert into public.ai_models(club_id,provider_id,model_id,purposes,priority,context_limit,max_output_tokens,price_in_per_million,price_out_per_million) values($1,$2,'synthetic',array['assistant_chat'],1,4096,128,1,2) returning id",
        [ids.north, providers[0]],
      )
    ).rows[0].id;
    await db.exec("reset role");
    await db.query(
      "insert into public.ai_attempts(club_id,provider_id,model_id,actor_profile_id,actor_role,purpose,trace_id,status,latency_ms,input_tokens,output_tokens,reserved_usd) values($1,$2,$3,$4,'director','assistant_chat',gen_random_uuid(),'succeeded',100,10,20,0.01),($1,$2,$3,$4,'director','assistant_chat',gen_random_uuid(),'failed',300,null,null,0.01)",
      [ids.north, providers[0], model, ids.director],
    );
    await asUser(db, ids.director);
    const result = (
      await db.query<{
        report: {
          rows: {
            calls: number;
            failed: number;
            unknown_token_calls: number;
            p50_ms: number;
          }[];
        };
      }>("select public.club_ai_usage_breakdown($1,14) report", [ids.north])
    ).rows[0].report;
    expect(result.rows[0]).toMatchObject({
      calls: 2,
      failed: 1,
      unknown_token_calls: 1,
      p50_ms: 200,
    });
    await asUser(db, ids.mentor);
    expect(
      (
        await db.query<{ report: { rows: unknown[] } }>(
          "select public.club_ai_usage_breakdown($1,14) report",
          [ids.north],
        )
      ).rows[0].report.rows,
    ).toHaveLength(0);
    await asUser(db, ids.otherDirector);
    await expect(
      db.query("select public.club_ai_usage_breakdown($1,14)", [ids.north]),
    ).rejects.toThrow("Not authorized");
  });
});
