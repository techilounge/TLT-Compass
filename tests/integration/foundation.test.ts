import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDatabase, ids, type TestDatabase } from "./database";
describe("foundation PostgreSQL permissions and RLS", () => {
  let db: TestDatabase;
  beforeAll(async () => {
    db = await createTestDatabase();
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });
  it("isolates two directors including cross-club updates", async () => {
    await asUser(db, ids.director);
    expect((await db.query("select id from public.clubs")).rows).toEqual([
      { id: ids.north },
    ]);
    expect(
      (
        await db.query(
          "update public.clubs set name='stolen' where id=$1 returning id",
          [ids.cedar],
        )
      ).rows,
    ).toEqual([]);
    await asUser(db, ids.otherDirector);
    expect((await db.query("select id from public.clubs")).rows).toEqual([
      { id: ids.cedar },
    ]);
  });
  it("requires adult MFA and rejects outsiders", async () => {
    await asUser(db, ids.director, "aal1");
    expect((await db.query("select * from public.clubs")).rows).toHaveLength(0);
    await asUser(db, ids.outsider);
    expect((await db.query("select * from public.clubs")).rows).toHaveLength(0);
    await expect(
      db.query("select public.set_member_role($1,$2,'director',true)", [
        ids.north,
        ids.outsider,
      ]),
    ).rejects.toThrow("Not authorized");
  });
  it("prevents participant self-promotion and raw membership writes", async () => {
    await asUser(db, ids.teen);
    await expect(
      db.query(
        "insert into public.club_memberships(club_id,profile_id,role) values($1,$2,'director')",
        [ids.north, ids.teen],
      ),
    ).rejects.toThrow();
    await expect(
      db.query("select public.set_member_role($1,$2,'director',true)", [
        ids.north,
        ids.teen,
      ]),
    ).rejects.toThrow();
  });
  it("rejects cross-club RPC and unscreened adult appointment", async () => {
    await asUser(db, ids.director);
    await expect(
      db.query("select public.set_member_role($1,$2,'coordinator',true)", [
        ids.cedar,
        ids.outsider,
      ]),
    ).rejects.toThrow("Not authorized");
    await expect(
      db.query("select public.set_member_role($1,$2,'coordinator',true)", [
        ids.north,
        ids.outsider,
      ]),
    ).rejects.toThrow("Adult eligibility required");
  });
  it("records redacted audits and denies forgery", async () => {
    await asUser(db, ids.director);
    await db.query(
      "update public.clubs set name='Updated Sandbox' where id=$1",
      [ids.north],
    );
    const logs = await db.query(
      "select actor_profile_id,details from public.audit_logs where actor_profile_id=$1",
      [ids.director],
    );
    expect(logs.rows).toHaveLength(1);
    expect(JSON.stringify(logs.rows)).not.toContain("Updated Sandbox");
    await expect(
      db.query("update public.audit_logs set action='forged'"),
    ).rejects.toThrow();
    await expect(
      db.query(
        "insert into public.audit_logs(club_id,action,resource_type,resource_id) values($1,'forged','x','x')",
        [ids.north],
      ),
    ).rejects.toThrow();
    await asUser(db, ids.mentor);
    expect(
      (await db.query("select * from public.audit_logs")).rows,
    ).toHaveLength(0);
  });
  it("revocation immediately removes access", async () => {
    await asUser(db, ids.director);
    await db.query(
      "select public.set_member_role($1,$2,'primary_mentor',false)",
      [ids.north, ids.mentor],
    );
    await asUser(db, ids.mentor);
    expect((await db.query("select * from public.clubs")).rows).toHaveLength(0);
    await asUser(db, ids.director);
    await db.query(
      "select public.set_member_role($1,$2,'primary_mentor',true)",
      [ids.north, ids.mentor],
    );
  });
  it("denies anonymous reads and privileged audit mutation", async () => {
    await db.exec("reset role; set role anon");
    await expect(db.query("select * from public.clubs")).rejects.toThrow();
    await db.exec("reset role; set role service_role");
    await expect(db.query("delete from public.audit_logs")).rejects.toThrow(
      "Audit records are immutable",
    );
  });
});
