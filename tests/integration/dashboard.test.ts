import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDatabase, ids, type TestDatabase } from "./database";
const participant = "60000000-0000-4000-8000-000000000001";
describe("RLS-scoped authoritative dashboards", () => {
  let db: TestDatabase;
  beforeAll(async () => {
    db = await createTestDatabase();
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });
  async function metrics(club: string, level: number | null = null) {
    return (
      await db.query<{ metrics: Record<string, number> }>(
        "select public.progress_dashboard($1,null,$2,null,null) metrics",
        [club, level],
      )
    ).rows[0].metrics;
  }
  it("returns no foreign-club or unauthenticated-adult records", async () => {
    await asUser(db, ids.otherDirector);
    expect((await metrics(ids.north)).participants).toBe(0);
    await asUser(db, ids.director, "aal1");
    expect((await metrics(ids.north)).participants).toBe(0);
    await asUser(db, ids.director);
    const m = await metrics(ids.north);
    expect(m.participants).toBe(1);
    expect(m.missing_primary_mentor).toBe(1);
    expect(m.attendance_denominator).toBe(0);
    expect(m.required_total).toBe(0);
  });
  it("retains mentor assignment and participant scope and filters level", async () => {
    await asUser(db, ids.mentor);
    expect((await metrics(ids.north)).participants).toBe(0);
    await asUser(db, ids.director);
    await db.query("select public.assign_mentor($1,$2,'primary',null)", [
      participant,
      ids.mentor,
    ]);
    await asUser(db, ids.mentor);
    expect((await metrics(ids.north)).participants).toBe(1);
    expect((await metrics(ids.north, 4)).participants).toBe(0);
    await asUser(db, ids.teen);
    expect((await metrics(ids.north)).participants).toBe(1);
    expect((await metrics(ids.cedar)).participants).toBe(0);
  });
  it("uses approved applicable requirements and emits scoped deadline reminders", async () => {
    await asUser(db, ids.director);
    await db.query(
      "select public.approve_rule_version('30000000-0000-4000-8000-000000000001','synthetic fixture')",
    );
    await db.query("select public.admit_participant($1)", [participant]);
    const task = (
      await db.query<{ id: string }>(
        "select public.create_task($1,'40000000-0000-4000-8000-000000000001','Supervised service','Synthetic instructions',current_date-1) id",
        [participant],
      )
    ).rows[0].id;
    const m = await metrics(ids.north);
    expect(m.required_total).toBe(1);
    expect(m.required_completed).toBe(0);
    expect(m.overdue_tasks).toBe(1);
    await asUser(db, ids.teen);
    expect(
      (
        await db.query("select task_id from public.workspace_reminders($1)", [
          ids.north,
        ])
      ).rows,
    ).toEqual([{ task_id: task }]);
    await asUser(db, ids.otherDirector);
    expect(
      (
        await db.query("select * from public.workspace_reminders($1)", [
          ids.north,
        ])
      ).rows,
    ).toHaveLength(0);
  });
});
