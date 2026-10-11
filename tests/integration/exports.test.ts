import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDatabase, ids, type TestDatabase } from "./database";
const participant = "60000000-0000-4000-8000-000000000001";
describe("participant export audit boundary", () => {
  let db: TestDatabase;
  beforeAll(async () => {
    db = await createTestDatabase();
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });
  it("denies foreign-club and adult sessions without MFA", async () => {
    await asUser(db, ids.otherDirector);
    await expect(
      db.query("select public.log_record_export($1,'csv')", [participant]),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.director, "aal1");
    await expect(
      db.query("select public.log_record_export($1,'csv')", [participant]),
    ).rejects.toThrow("Not authorized");
  });
  it("records scoped exports without evidence or identity payloads", async () => {
    await asUser(db, ids.teen);
    await db.query("select public.log_record_export($1,'csv')", [participant]);
    await expect(
      db.query("select public.log_record_export($1,'html')", [participant]),
    ).rejects.toThrow("Invalid export format");
    await db.exec("reset role");
    const result = await db.query<{
      details: unknown;
      actor_profile_id: string;
      club_id: string;
    }>(
      "select details,actor_profile_id,club_id from public.audit_logs where action='export_generated'",
    );
    expect(result.rows).toEqual([
      {
        details: { format: "csv" },
        actor_profile_id: ids.teen,
        club_id: ids.north,
      },
    ]);
  });
});
