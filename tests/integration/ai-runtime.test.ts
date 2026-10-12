import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDatabase, ids, type TestDatabase } from "./database";
describe("trusted AI runtime boundary", () => {
  let db: TestDatabase;
  beforeAll(async () => {
    db = await createTestDatabase();
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });
  it("prevents ordinary staff from fabricating provider accounting", async () => {
    await asUser(db, ids.mentor);
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "select public.can_run_ai($1) allowed",
          [ids.north],
        )
      ).rows[0].allowed,
    ).toBe(false);
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "select pg_has_role('authenticated','tlt_ai_runtime','MEMBER') allowed",
        )
      ).rows[0].allowed,
    ).toBe(false);
  });
  it("gives the runtime only named functions and no table access", async () => {
    await db.exec("reset role");
    await db.exec("set role tlt_ai_runtime");
    await expect(
      db.query("select * from public.tlt_participants"),
    ).rejects.toThrow(/permission denied/);
    await expect(db.query("select * from public.ai_providers")).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      db.query(
        "select public.reset_ai_route('00000000-0000-4000-8000-000000000000')",
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
