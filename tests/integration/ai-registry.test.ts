import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { asUser, createTestDatabase, ids, type TestDatabase } from "./database";
describe("AI registry scope and budgets", () => {
  let db: TestDatabase;
  let provider: string;
  let model: string;
  let attempt: string;
  beforeAll(async () => {
    db = await createTestDatabase();
    await db.exec(
      `insert into public.platform_owners(profile_id) values('${ids.director}')`,
    );
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });
  it("keeps platform ownership separate from director and requires MFA", async () => {
    await asUser(db, ids.otherDirector);
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "select public.can_configure_ai($1) allowed",
          [ids.cedar],
        )
      ).rows[0].allowed,
    ).toBe(false);
    await expect(
      db.query("insert into public.platform_owners(profile_id) values($1)", [
        ids.otherDirector,
      ]),
    ).rejects.toThrow(/permission denied/);
    await asUser(db, ids.director, "aal1");
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "select public.can_configure_ai($1) allowed",
          [ids.north],
        )
      ).rows[0].allowed,
    ).toBe(false);
    await asUser(db, ids.director);
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "select public.can_configure_ai($1) allowed",
          [ids.north],
        )
      ).rows[0].allowed,
    ).toBe(true);
    await db.query("insert into public.ai_settings(club_id) values($1)", [
      ids.north,
    ]);
    provider = (
      await db.query<{ id: string }>(
        "insert into public.ai_providers(club_id,name,provider_type,base_url,credential_secret_ref,priority,enabled,privacy_approved,created_by) values($1,'Synthetic','gemini','https://generativelanguage.googleapis.com/v1beta','AI_SECRET_TEST',1,true,true,$2) returning id",
        [ids.north, ids.director],
      )
    ).rows[0].id;
    model = (
      await db.query<{ id: string }>(
        "insert into public.ai_models(club_id,provider_id,model_id,purposes,priority,context_limit,max_output_tokens,price_in_per_million,price_out_per_million,enabled) values($1,$2,'synthetic',array['assistant_chat'],1,4096,128,1,2,true) returning id",
        [ids.north, provider],
      )
    ).rows[0].id;
    await expect(
      db.query(
        "select public.reserve_ai_attempt($1,$2,'assistant_chat',$3,1000,64)",
        [ids.north, model, randomUUID()],
      ),
    ).rejects.toThrow("AI disabled");
  });
  it("reserves full-month costs and rejects foreign scope and token overrun", async () => {
    await db.query(
      "update public.ai_settings set enabled=true,monthly_budget_usd=0.002,role_monthly_budget_usd=0.002,request_ceiling_usd=0.002 where club_id=$1",
      [ids.north],
    );
    attempt = (
      await db.query<{ id: string }>(
        "select public.reserve_ai_attempt($1,$2,'assistant_chat',$3,1000,64) id",
        [ids.north, model, randomUUID()],
      )
    ).rows[0].id;
    await expect(
      db.query(
        "select public.reserve_ai_attempt($1,$2,'assistant_chat',$3,1000,64)",
        [ids.north, model, randomUUID()],
      ),
    ).rejects.toThrow("budget");
    await expect(
      db.query(
        "select public.reserve_ai_attempt($1,$2,'assistant_chat',$3,1000,200)",
        [ids.north, model, randomUUID()],
      ),
    ).rejects.toThrow("bounds");
    await asUser(db, ids.otherDirector);
    expect(
      (await db.query("select id from public.ai_providers")).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.finish_ai_attempt($1,'succeeded',null,10,10,5)", [
        attempt,
      ]),
    ).rejects.toThrow("Not authorized");
  });
  it("records a Gemini permission fault without private provider text and requires explicit reset", async () => {
    await asUser(db, ids.director);
    await db.query(
      "select public.finish_ai_attempt($1,'failed','permission',10,null,null)",
      [attempt],
    );
    expect(
      (
        await db.query<{ configuration_fault: boolean }>(
          "select configuration_fault from public.ai_models where id=$1",
          [model],
        )
      ).rows[0].configuration_fault,
    ).toBe(true);
    await expect(
      db.query("select public.finish_ai_attempt($1,'succeeded',null,10,10,5)", [
        attempt,
      ]),
    ).rejects.toThrow("already finished");
    await db.query("select public.reset_ai_route($1)", [model]);
    expect(
      (
        await db.query<{ configuration_fault: boolean }>(
          "select configuration_fault from public.ai_models where id=$1",
          [model],
        )
      ).rows[0].configuration_fault,
    ).toBe(false);
    await expect(
      db.query(
        "update public.ai_models set configuration_fault=false where id=$1",
        [model],
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("never refunds failed or unfinished reservations into spendable budget", async () => {
    await expect(
      db.query(
        "select public.reserve_ai_attempt($1,$2,'assistant_chat',$3,1000,64)",
        [ids.north, model, randomUUID()],
      ),
    ).rejects.toThrow("budget");
  });
});
