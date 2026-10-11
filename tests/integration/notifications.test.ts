import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createTestDatabase, asUser, ids, type TestDatabase } from "./database";
const participant = "60000000-0000-4000-8000-000000000001",
  requirement = "40000000-0000-4000-8000-000000000001",
  rule = "30000000-0000-4000-8000-000000000001";
describe("private durable task inbox", () => {
  let db: TestDatabase, task: string, notification: string;
  beforeAll(async () => {
    db = await createTestDatabase();
    await asUser(db, ids.director);
    await db.query(
      "select public.approve_rule_version($1,'Synthetic notification fixture')",
      [rule],
    );
    await db.query("select public.assign_mentor($1,$2,'primary',null)", [
      participant,
      ids.mentor,
    ]);
    await db.query("select public.admit_participant($1)", [participant]);
    task = (
      await db.query<{ id: string }>(
        "select public.create_task_draft($1,$2,'Synthetic inbox task','Private evidence stays in the record',current_date+1) id",
        [participant, requirement],
      )
    ).rows[0].id;
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });
  it("creates no draft notice and delivers a generic assignment only to the participant", async () => {
    await asUser(db, ids.teen);
    expect(
      (await db.query("select id from public.notifications")).rows,
    ).toHaveLength(0);
    await asUser(db, ids.director);
    await db.query("select public.transition_task($1,'draft','assigned')", [
      task,
    ]);
    expect(
      (await db.query("select id from public.notifications")).rows,
    ).toHaveLength(0);
    await asUser(db, ids.teen);
    const rows = (
      await db.query<{ id: string; kind: string }>(
        "select id,kind from public.notifications",
      )
    ).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("assigned");
    notification = rows[0].id;
  });
  it("denies foreign reads and marks only the recipient notice read idempotently", async () => {
    await asUser(db, ids.otherDirector);
    expect(
      (await db.query("select id from public.notifications")).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.mark_notification_read($1)", [notification]),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.teen);
    await db.query("select public.mark_notification_read($1)", [notification]);
    const first = (
      await db.query<{ read_at: unknown }>(
        "select read_at from public.notifications",
      )
    ).rows[0].read_at;
    await db.query("select public.mark_notification_read($1)", [notification]);
    expect(
      (await db.query("select read_at from public.notifications")).rows[0]
        .read_at,
    ).toEqual(first);
    await expect(
      db.query(
        "insert into public.notifications(club_id,recipient_id,participant_id,task_id,kind) values($1,$2,$3,$4,'assigned')",
        [ids.north, ids.teen, participant, task],
      ),
    ).rejects.toThrow("permission denied");
  });
  it("notifies eligible scoped reviewers on submission and removes access after assignment ends", async () => {
    await asUser(db, ids.teen);
    await db.query(
      "select public.transition_task($1,'assigned','in_progress')",
      [task],
    );
    const submission = (
      await db.query<{ id: string }>(
        "select public.submit_task($1,'Synthetic private evidence','Synthetic reflection',current_date) id",
        [task],
      )
    ).rows[0].id;
    await asUser(db, ids.mentor);
    expect(
      (await db.query("select kind from public.notifications")).rows,
    ).toEqual([{ kind: "submitted" }]);
    await asUser(db, ids.director);
    expect(
      (await db.query("select kind from public.notifications")).rows,
    ).toEqual([{ kind: "submitted" }]);
    await db.query(
      "select public.review_submission($1,'changes_requested','Please clarify the synthetic plan')",
      [submission],
    );
    await db.exec("reset role");
    await db.query(
      "update public.mentor_assignments set starts_on=current_date-2,ends_on=current_date-1 where participant_id=$1",
      [participant],
    );
    await asUser(db, ids.mentor);
    expect(
      (await db.query("select id from public.notifications")).rows,
    ).toHaveLength(0);
  });
  it("respects inbox opt-out and hides historical updates after consent withdrawal", async () => {
    await asUser(db, ids.teen);
    await db.query("select public.set_notification_preferences($1,false)", [
      ids.north,
    ]);
    await expect(
      db.query("select public.set_notification_preferences($1,true)", [
        ids.cedar,
      ]),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.director);
    await db.query(
      "select public.transition_task($1,'changes_requested','cancelled')",
      [task],
    );
    await asUser(db, ids.teen);
    expect(
      (await db.query("select id from public.notifications")).rows,
    ).toHaveLength(2);
    await db.exec("reset role");
    await db.query(
      "update public.tlt_participants set consent_state='withdrawn' where id=$1",
      [participant],
    );
    await asUser(db, ids.teen);
    expect(
      (await db.query("select id from public.notifications")).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.mark_notification_read($1)", [notification]),
    ).rejects.toThrow("Not authorized");
  });
});
