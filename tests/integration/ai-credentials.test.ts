import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { asUser, createTestDatabase, ids, type TestDatabase } from "./database";
import { sealCredential } from "../../modules/ai/crypto";
import { randomBytes } from "node:crypto";
describe("AI encrypted credential boundary", () => {
  let db: TestDatabase, provider: string;
  beforeAll(async () => {
    db = await createTestDatabase();
    await db.exec(
      `insert into public.platform_owners(profile_id) values('${ids.director}')`,
    );
    await asUser(db, ids.director);
    provider = (
      await db.query<{ id: string }>(
        "insert into public.ai_providers(club_id,name,provider_type,base_url,credential_secret_ref,priority,created_by) values($1,'Synthetic','gemini','https://generativelanguage.googleapis.com/v1beta','AI_SECRET_TEST',1,$2) returning id",
        [ids.north, ids.director],
      )
    ).rows[0].id;
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });
  it("denies browser reads and direct key writes even to an owner", async () => {
    await expect(
      db.query("select * from public.ai_credentials"),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.query("select public.store_ai_credential($1,$2,'test')", [
        provider,
        sealCredential("synthetic-secret", provider, randomBytes(32)),
      ]),
    ).rejects.toThrow(/permission denied/);
  });
  it("permits trusted owner rotation and scoped staff runtime reads only", async () => {
    const encrypted = sealCredential(
      "synthetic-secret",
      provider,
      randomBytes(32),
    );
    await db.exec("reset role;set role tlt_ai_runtime");
    await db.query("select public.store_ai_credential($1,$2,'cret')", [
      provider,
      encrypted,
    ]);
    expect(
      (
        await db.query<{ value: string }>(
          "select public.read_ai_credential($1,$2) value",
          [ids.north, provider],
        )
      ).rows[0].value,
    ).toBe(encrypted);
    await asUser(db, ids.otherDirector);
    await db.exec("reset role;set role tlt_ai_runtime");
    await expect(
      db.query("select public.read_ai_credential($1,$2)", [
        ids.north,
        provider,
      ]),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.mentor);
    await db.exec("reset role;set role tlt_ai_runtime");
    await expect(
      db.query("select public.store_ai_credential($1,$2,'cret')", [
        provider,
        encrypted,
      ]),
    ).rejects.toThrow("Not authorized");
  });
});
